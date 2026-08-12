/**
 * Command surface. The Java bot discovers commands by reflecting over annotated static methods;
 * here they are a plain array, which gives the same "add a command by adding one entry" property
 * without the reflection.
 *
 * Music commands are deliberately not ported.
 */

import { JavaRandom } from '../dice/javaRandom.js';
import { CommandContext } from '../dice/evaluator.js';
import { RollInterpreter } from '../dice/interpreter.js';
import { parse } from '../dice/parser.js';
import { cardToString } from '../game/cards.js';
import { describeCards, KNOWN_STATES, type Table, type Tables } from '../game/state.js';

export type CommandCategory =
  | 'DICE'
  | 'INITIATIVE'
  | 'BENNIES'
  | 'CHARACTERS'
  | 'TOKENS'
  | 'STATES'
  | 'INFO'
  | 'ADMIN';

export interface CommandRequest {
  args: string[];
  channelId: string;
  guildId: string | undefined;
  authorId: string;
  authorName: string;
  prefix: string;
  tables: Tables;
  random: JavaRandom;
}

export interface CommandResult {
  /** Text to post in the channel. */
  text: string;
  /** When true, also send privately (DM + thread), as `help` does. */
  isPrivate?: boolean;
}

export interface Command {
  name: string;
  aliases: string[];
  category: CommandCategory;
  description: string;
  arguments: string[];
  run(req: CommandRequest): CommandResult;
}

const bold = (s: string | number): string => `**${s}**`;

function rollExpression(expression: string[], random: JavaRandom): string {
  const statements = parse(expression);
  return new RollInterpreter(new CommandContext(random)).run(statements).trim();
}

function requireArgs(req: CommandRequest, n: number, usage: string): void {
  if (req.args.length < n) {
    throw new CommandError(`Usage: \`${req.prefix}${usage}\``);
  }
}

export class CommandError extends Error {}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

const diceCommands: Command[] = [
  {
    name: 'r',
    aliases: ['roll'],
    category: 'DICE',
    description: 'Rolls dice. Text mixed with the roll is echoed back.',
    arguments: ['<expression1> ... <expressionN>'],
    run: (req) => {
      requireArgs(req, 1, 'r 2d6');
      return { text: rollExpression(req.args, req.random) };
    },
  },
  {
    name: 'rs',
    aliases: [],
    category: 'DICE',
    description: 'Rolls several expressions, each on its own line with an optional heading.',
    arguments: ['[<heading>] <expression> ...'],
    run: (req) => {
      requireArgs(req, 1, 'rs attack s8 damage 2d6!');
      return { text: req.args.map((a) => rollExpression([a], req.random)).join('\n') };
    },
  },
  {
    name: 'rh',
    aliases: [],
    category: 'DICE',
    description: 'Rolls privately — the result is sent to you, not the channel.',
    arguments: ['<expression>'],
    run: (req) => {
      requireArgs(req, 1, 'rh s8');
      return { text: rollExpression(req.args, req.random), isPrivate: true };
    },
  },
];

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

function renderInitiative(table: Table): string {
  if (table.characters.size === 0) {
    return 'No characters. Add some with `init <name> [q|l|i|h]`.';
  }
  const lines = table.order().map((c) => {
    const marks: string[] = [];
    if (c.onHold) marks.push('on hold');
    if (c.states.length > 0) marks.push(c.states.join(', '));
    if (c.bennies > 0) marks.push(`bennies: ${c.bennies}`);
    const suffix = marks.length > 0 ? ` — ${marks.join('; ')}` : '';
    return `${describeCards(c)}  ${bold(c.name)}${suffix}`;
  });
  return `Round ${bold(table.round)}\n${lines.join('\n')}`;
}

const initiativeCommands: Command[] = [
  {
    name: 'fight',
    aliases: [],
    category: 'INITIATIVE',
    description: 'Starts a new fight: shuffles the deck, resets to round 1 and deals.',
    arguments: [],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      table.startFight();
      return { text: `Fight on!\n${renderInitiative(table)}` };
    },
  },
  {
    name: 'round',
    aliases: [],
    category: 'INITIATIVE',
    description: 'Starts the next round, reshuffling if a joker was dealt.',
    arguments: [],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      const { reshuffled } = table.newRound();
      const note = reshuffled ? 'Joker was dealt last round, deck is shuffled.\n' : '';
      return { text: `${note}${renderInitiative(table)}` };
    },
  },
  {
    name: 'init',
    aliases: [],
    category: 'INITIATIVE',
    description:
      'Adds characters to the fight. Modifiers: q Quick, l Level Headed, i Improved Level Headed, h Hesitant.',
    arguments: ['<character>[:<modifiers>] ...'],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      if (req.args.length === 0) return { text: renderInitiative(table) };
      for (const arg of req.args) {
        const [name, mods] = arg.split(':');
        if (!name) continue;
        const c = table.getOrCreate(name);
        if (mods !== undefined) c.initParams = mods;
        validateInitParams(c.initParams);
        table.dealTo(c);
      }
      return { text: renderInitiative(table) };
    },
  },
  {
    name: 'card',
    aliases: [],
    category: 'INITIATIVE',
    description: 'Deals one more card to a character.',
    arguments: ['<character>'],
    run: (req) => {
      requireArgs(req, 1, 'card Huey');
      const table = req.tables.get(req.channelId);
      const c = table.get(req.args[0]!);
      if (!c) throw new CommandError(`No such character: \`${req.args[0]}\``);
      table.dealTo(c);
      return { text: renderInitiative(table) };
    },
  },
  {
    name: 'deal',
    aliases: ['dl'],
    category: 'INITIATIVE',
    description: 'Deals initiative cards to everyone not on hold.',
    arguments: [],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      table.dealAll();
      return { text: renderInitiative(table) };
    },
  },
  {
    name: 'hold',
    aliases: [],
    category: 'INITIATIVE',
    description: 'Toggles hold for a character. Prefix with `-` to clear.',
    arguments: ['[-]<character>'],
    run: (req) => {
      requireArgs(req, 1, 'hold Huey');
      const table = req.tables.get(req.channelId);
      for (const arg of req.args) {
        const clearing = arg.startsWith('-');
        const name = clearing ? arg.substring(1) : arg;
        const c = table.get(name);
        if (!c) throw new CommandError(`No such character: \`${name}\``);
        c.onHold = !clearing;
      }
      return { text: renderInitiative(table) };
    },
  },
  {
    name: 'drop',
    aliases: [],
    category: 'INITIATIVE',
    description: 'Removes characters from the fight.',
    arguments: ['<character> ...'],
    run: (req) => {
      requireArgs(req, 1, 'drop Huey');
      const table = req.tables.get(req.channelId);
      const dropped: string[] = [];
      for (const name of req.args) {
        if (table.remove(name)) dropped.push(name);
      }
      if (dropped.length === 0) throw new CommandError('No matching characters.');
      return { text: `Dropped: ${dropped.join(', ')}\n${renderInitiative(table)}` };
    },
  },
];

function validateInitParams(params: string): void {
  const p = params.toLowerCase();
  const has = (ch: string): boolean => p.includes(ch);
  if (has('q') && has('h')) throw new CommandError('Quick and Hesitant are incompatible.');
  if (has('l') && has('h')) throw new CommandError('Level Headed and Hesitant are incompatible.');
  if (has('i') && has('h')) {
    throw new CommandError('Improved Level Headed and Hesitant are incompatible.');
  }
  for (const ch of p) {
    if (!'qlih'.includes(ch)) throw new CommandError(`Unknown initiative modifier: \`${ch}\``);
  }
}

// ---------------------------------------------------------------------------
// Bennies, tokens, states, characters
// ---------------------------------------------------------------------------

function adjust(
  req: CommandRequest,
  field: 'bennies' | 'tokens',
  delta: number,
  verb: string,
): CommandResult {
  requireArgs(req, 1, `${verb} Huey [amount]`);
  const table = req.tables.get(req.channelId);
  const c = table.getOrCreate(req.args[0]!);
  const amount = req.args[1] !== undefined ? Number(req.args[1]) : 1;
  if (!Number.isInteger(amount) || amount < 0) {
    throw new CommandError(`Not a valid amount: \`${req.args[1]}\``);
  }
  c[field] = Math.max(0, c[field] + delta * amount);
  return { text: `${bold(c.name)} ${field}: ${bold(c[field])}` };
}

const resourceCommands: Command[] = [
  {
    name: 'givebenny',
    aliases: ['gb'],
    category: 'BENNIES',
    description: 'Gives bennies to a character.',
    arguments: ['<character> [<amount>]'],
    run: (req) => adjust(req, 'bennies', +1, 'givebenny'),
  },
  {
    name: 'takebenny',
    aliases: ['tb'],
    category: 'BENNIES',
    description: 'Spends bennies from a character.',
    arguments: ['<character> [<amount>]'],
    run: (req) => adjust(req, 'bennies', -1, 'takebenny'),
  },
  {
    name: 'bennies',
    aliases: ['bs'],
    category: 'BENNIES',
    description: 'Shows everyone’s bennies.',
    arguments: [],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      if (table.characters.size === 0) return { text: 'No characters.' };
      return {
        text: [...table.characters.values()]
          .map((c) => `${bold(c.name)}: ${c.bennies}`)
          .join('\n'),
      };
    },
  },
  {
    name: 'initbennies',
    aliases: ['ib'],
    category: 'BENNIES',
    description: 'Resets everyone to the standard three bennies.',
    arguments: ['[<amount>]'],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      const amount = req.args[0] !== undefined ? Number(req.args[0]) : 3;
      if (!Number.isInteger(amount) || amount < 0) {
        throw new CommandError(`Not a valid amount: \`${req.args[0]}\``);
      }
      for (const c of table.characters.values()) c.bennies = amount;
      return { text: `Everyone has ${bold(amount)} bennies.` };
    },
  },
  {
    name: 'give',
    aliases: [],
    category: 'TOKENS',
    description: 'Gives tokens to a character.',
    arguments: ['<character> [<amount>]'],
    run: (req) => adjust(req, 'tokens', +1, 'give'),
  },
  {
    name: 'take',
    aliases: [],
    category: 'TOKENS',
    description: 'Takes tokens from a character.',
    arguments: ['<character> [<amount>]'],
    run: (req) => adjust(req, 'tokens', -1, 'take'),
  },
  {
    name: 'state',
    aliases: [],
    category: 'STATES',
    description: `Toggles a status effect. Known: ${KNOWN_STATES.join(', ')}. Prefix with - to clear.`,
    arguments: ['<character> [-]<state> ...'],
    run: (req) => {
      requireArgs(req, 2, 'state Huey shaken');
      const table = req.tables.get(req.channelId);
      const c = table.getOrCreate(req.args[0]!);
      for (const raw of req.args.slice(1)) {
        const clearing = raw.startsWith('-');
        const state = (clearing ? raw.substring(1) : raw).toLowerCase();
        if (!KNOWN_STATES.includes(state as (typeof KNOWN_STATES)[number])) {
          throw new CommandError(`Unknown state: \`${state}\``);
        }
        const has = c.states.includes(state);
        if (clearing && has) c.states = c.states.filter((s) => s !== state);
        else if (!clearing && !has) c.states.push(state);
      }
      const shown = c.states.length > 0 ? c.states.join(', ') : 'none';
      return { text: `${bold(c.name)}: ${shown}` };
    },
  },
  {
    name: 'list',
    aliases: [],
    category: 'CHARACTERS',
    description: 'Lists characters at this table.',
    arguments: [],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      if (table.characters.size === 0) return { text: 'No characters.' };
      return { text: renderInitiative(table) };
    },
  },
  {
    name: 'remove',
    aliases: ['rm'],
    category: 'CHARACTERS',
    description: 'Removes characters from this table.',
    arguments: ['<character> ...'],
    run: (req) => {
      requireArgs(req, 1, 'remove Huey');
      const table = req.tables.get(req.channelId);
      const removed = req.args.filter((n) => table.remove(n));
      if (removed.length === 0) throw new CommandError('No matching characters.');
      return { text: `Removed: ${removed.join(', ')}` };
    },
  },
  {
    name: 'clear',
    aliases: [],
    category: 'ADMIN',
    description: 'Clears all characters and ends the fight.',
    arguments: [],
    run: (req) => {
      const table = req.tables.get(req.channelId);
      table.characters.clear();
      table.fightOn = false;
      table.round = 0;
      return { text: 'Table cleared.' };
    },
  },
  {
    name: 'shuffle',
    aliases: [],
    category: 'INITIATIVE',
    description: 'Shuffles the initiative deck.',
    arguments: [],
    run: (req) => {
      req.tables.get(req.channelId).deck.shuffle();
      return { text: 'Deck shuffled.' };
    },
  },
  {
    name: 'show',
    aliases: ['sh'],
    category: 'INITIATIVE',
    description: 'Shows the current initiative order.',
    arguments: [],
    run: (req) => ({ text: renderInitiative(req.tables.get(req.channelId)) }),
  },
];

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------

const infoCommands: Command[] = [
  {
    name: 'ping',
    aliases: [],
    category: 'INFO',
    description: 'Checks the bot is responding.',
    arguments: [],
    run: () => ({ text: 'pong' }),
  },
  {
    name: 'help',
    aliases: [],
    category: 'INFO',
    description: 'Lists commands, or details for one command or category.',
    arguments: ['[<command> or <category>]'],
    // Private: delivered to the user's DMs and mirrored into a thread on the command
    // message, so a long listing does not flood the channel mid-game.
    run: (req) => ({ text: renderHelp(req), isPrivate: true }),
  },
];

function renderHelp(req: CommandRequest): string {
  const p = req.prefix;
  const target = req.args[0]?.toLowerCase();

  if (target) {
    const command = findCommand(target);
    if (command) {
      const names = [command.name, ...command.aliases].map((n) => `\`${p}${n}\``).join(' or ');
      return `${names} ${command.arguments.join(' ')}\n${command.description}`;
    }
    const category = target.toUpperCase();
    const inCategory = ALL_COMMANDS.filter((c) => c.category === category);
    if (inCategory.length > 0) {
      return `__**${category}**__\n${inCategory.map((c) => briefHelp(c, p)).join('\n')}`;
    }
  }

  const categories = [...new Set(ALL_COMMANDS.map((c) => c.category))];
  const sections = categories.map((category) => {
    const inCategory = ALL_COMMANDS.filter((c) => c.category === category);
    return `__**${category}**__\n${inCategory.map((c) => briefHelp(c, p)).join('\n')}`;
  });
  return `${sections.join('\n\n')}\n\nRoll dice directly too, e.g. \`${p}s8\`, \`${p}e6\`, \`${p}2d6!\`.`;
}

/** Uses the caller's actual prefix — the Java version hardcoded `!` here regardless. */
function briefHelp(command: Command, prefix: string): string {
  let line = `${prefix}${command.name}`;
  if (command.arguments.length > 0) line += ` ${command.arguments.join(' ')}`;
  if (command.aliases.length > 0) {
    line += `; aliases: ${command.aliases.map((a) => prefix + a).join(' ')}`;
  }
  return line;
}

export const ALL_COMMANDS: Command[] = [
  ...diceCommands,
  ...initiativeCommands,
  ...resourceCommands,
  ...infoCommands,
];

const BY_NAME = new Map<string, Command>();
for (const command of ALL_COMMANDS) {
  BY_NAME.set(command.name, command);
  for (const alias of command.aliases) BY_NAME.set(alias, command);
}

export function findCommand(name: string): Command | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export { cardToString };
