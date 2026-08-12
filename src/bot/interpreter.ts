/**
 * Port of `CommandInterpreter`: walk the message word by word, dispatch anything starting with the
 * user's prefix, and fall through to the dice parser so bare `!s8` / `!2d6!` work without being
 * registered commands. Words that are neither are echoed back, which is what lets players mix
 * narration with rolls.
 */

import { JavaRandom } from '../dice/javaRandom.js';
import { CommandContext } from '../dice/evaluator.js';
import { RollInterpreter } from '../dice/interpreter.js';
import { parse } from '../dice/parser.js';
import type { Tables } from '../game/state.js';
import { CommandError, findCommand, type CommandRequest } from './commands.js';

export interface IncomingMessage {
  content: string;
  channelId: string;
  guildId: string | undefined;
  authorId: string;
  authorName: string;
}

export interface InterpretedResponse {
  publicText: string;
  privateText: string;
}

export interface InterpreterOptions {
  prefix: string;
  tables: Tables;
  random?: JavaRandom;
  /** Mentioning the bot also triggers commands, as in the Java version. */
  botMention?: string;
}

export function interpret(
  message: IncomingMessage,
  options: InterpreterOptions,
): InterpretedResponse {
  const { prefix, tables } = options;
  const random = options.random ?? new JavaRandom();

  let content = message.content.trim();
  let mentioned = false;
  if (options.botMention && content.startsWith(options.botMention)) {
    content = content.substring(options.botMention.length).trim();
    mentioned = true;
  }

  const words = content.split(/\s+/).filter((w) => w.length > 0);
  const publicParts: string[] = [];
  const privateParts: string[] = [];
  let handled = false;

  let i = 0;
  while (i < words.length) {
    const word = words[i]!;
    const isPrefixed = word.startsWith(prefix);
    // When @-mentioned the whole message is treated as a command, prefix or not.
    const bare = isPrefixed ? word.substring(prefix.length) : word;

    if (!isPrefixed && !mentioned) {
      publicParts.push(word);
      i++;
      continue;
    }

    const command = findCommand(bare);
    if (command) {
      // A command consumes the rest of the line; the Java version consumes a declared arity, but
      // every ported command is variadic or ignores extras, and this avoids arity bookkeeping.
      const args = words.slice(i + 1);
      const req: CommandRequest = {
        args,
        channelId: message.channelId,
        guildId: message.guildId,
        authorId: message.authorId,
        authorName: message.authorName,
        prefix,
        tables,
        random,
      };
      try {
        const result = command.run(req);
        if (result.isPrivate) privateParts.push(result.text);
        else publicParts.push(result.text);
      } catch (e) {
        const msg = e instanceof CommandError ? e.message : `Error in \`${bare}\`: ${String(e)}`;
        publicParts.push(msg);
      }
      handled = true;
      i = words.length;
      continue;
    }

    // Not a registered command — try it as a dice expression.
    const statements = parse([bare]);
    const allUnparsed = statements.every((s) => s.kind === 'NonParsedString');
    if (allUnparsed) {
      publicParts.push(word);
    } else {
      publicParts.push(new RollInterpreter(new CommandContext(random)).run(statements).trim());
      handled = true;
    }
    i++;
  }

  return {
    publicText: handled ? publicParts.join(' ').trim() : '',
    privateText: privateParts.join('\n').trim(),
  };
}
