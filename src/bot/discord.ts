/**
 * Discord transport. Replaces the Java `ParseInputListener` / `DiscordResponseBuilder` /
 * `MessageSplitter` stack.
 *
 * Two behaviours carried over deliberately from the fixes made to the Java bot:
 *  - private replies go to the user's DMs *and* into a thread on the command message;
 *  - every send has an error handler, so a failed delivery is logged rather than vanishing.
 */

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import { JavaRandom } from '../dice/javaRandom.js';
import { Tables } from '../game/state.js';
import { interpret } from './interpreter.js';
import { CommandError, findCommand, type CommandRequest } from './commands.js';

export const MESSAGE_LENGTH_LIMIT = 2000;
/** Discord caps thread names at 100 characters. */
const THREAD_NAME_LIMIT = 100;

/** Splits on line boundaries where possible so a roll's output is not cut mid-line. */
export function splitMessage(text: string, limit = MESSAGE_LENGTH_LIMIT): string[] {
  if (text.length <= limit) return text.length > 0 ? [text] : [];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > limit) {
      if (current.length > 0) parts.push(current);
      current = '';
      // A single line longer than the limit still has to be hard-split.
      let rest = line;
      while (rest.length > limit) {
        parts.push(rest.substring(0, limit));
        rest = rest.substring(limit);
      }
      current = rest;
    } else {
      current = current.length > 0 ? `${current}\n${line}` : line;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export interface BotOptions {
  token: string;
  prefix: string;
  tables: Tables;
}

export function createClient(options: BotOptions): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  const random = new JavaRandom();

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}; prefix "${options.prefix}"`);
    // The Java bot registered these globally, and global registrations outlive the process. If we
    // did not re-register (or clear) them they would linger in the picker and time out.
    void registerSlashCommands(c).catch((e) => console.error('Slash registration failed', e));
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) return;
    void handleMessage(message, options, random);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleInteraction(interaction, options, random);
  });

  return client;
}

/**
 * Commands exposed as slash commands. Everything remains available via the prefix.
 *
 * These are the names Discord will show; `roll` rather than `r` because that is what the Java bot
 * registered and what players' muscle memory expects. `commands.set()` replaces the global set
 * wholesale, so any Java-era registration not listed here is cleared rather than left to time out.
 */
export const SLASH_COMMAND_NAMES = [
  'roll',
  'rh',
  'fight',
  'round',
  'init',
  'deal',
  'card',
  'hold',
  'drop',
  'show',
  'givebenny',
  'takebenny',
  'bennies',
  'help',
] as const;

export function buildSlashCommands(): SlashCommandBuilder[] {
  const builders: SlashCommandBuilder[] = [];
  for (const name of SLASH_COMMAND_NAMES) {
    const command = findCommand(name);
    if (!command) continue;
    // Register under the declared name (which may be an alias, e.g. `roll` for `r`);
    // findCommand resolves aliases when the interaction comes back.
    const builder = new SlashCommandBuilder()
      .setName(name)
      .setDescription(command.description.slice(0, 100));
    if (command.arguments.length > 0) {
      builder.addStringOption((option) =>
        option
          .setName('args')
          .setDescription(command.arguments.join(' ').slice(0, 100))
          .setRequired(false),
      );
    }
    builders.push(builder);
  }
  return builders;
}

async function registerSlashCommands(client: Client<true>): Promise<void> {
  const body = buildSlashCommands().map((b) => b.toJSON());
  await client.application.commands.set(body);
  console.log(`Registered ${body.length} slash commands`);
}

async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  options: BotOptions,
  random: JavaRandom,
): Promise<void> {
  const command = findCommand(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    return;
  }

  const raw = interaction.options.getString('args') ?? '';
  const args = raw.split(/\s+/).filter((w) => w.length > 0);

  const req: CommandRequest = {
    args,
    channelId: interaction.channelId,
    guildId: interaction.guildId ?? undefined,
    authorId: interaction.user.id,
    authorName: interaction.user.username,
    prefix: options.prefix,
    tables: options.tables,
    random,
  };

  let text: string;
  let isPrivate = false;
  try {
    const result = command.run(req);
    text = result.text;
    isPrivate = result.isPrivate === true;
  } catch (e) {
    text = e instanceof CommandError ? e.message : `Error: ${String(e)}`;
    isPrivate = true;
  }

  const parts = splitMessage(text);
  const first = parts.shift() ?? '(no output)';
  try {
    // Private results become ephemeral replies — the interaction equivalent of a DM.
    await interaction.reply({ content: first, ephemeral: isPrivate });
    for (const part of parts) {
      await interaction.followUp({ content: part, ephemeral: isPrivate });
    }
  } catch (error) {
    console.error('Could not reply to interaction', error);
  }

  void options.tables.persist().catch((e) => console.error('Failed to persist tables', e));
}

async function handleMessage(
  message: Message,
  options: BotOptions,
  random: JavaRandom,
): Promise<void> {
  const botMention = message.client.user ? `<@${message.client.user.id}>` : undefined;

  let response;
  try {
    response = interpret(
      {
        content: message.content,
        channelId: message.channelId,
        guildId: message.guildId ?? undefined,
        authorId: message.author.id,
        authorName: message.member?.displayName ?? message.author.username,
      },
      {
        prefix: options.prefix,
        tables: options.tables,
        random,
        ...(botMention !== undefined ? { botMention } : {}),
      },
    );
  } catch (error) {
    console.error('Interpreter failed', error);
    return;
  }

  if (response.publicText.length > 0) {
    const header = `${message.author.toString()}\n`;
    for (const part of splitMessage(header + response.publicText)) {
      await send(message.channel, part);
    }
  }

  if (response.privateText.length > 0) {
    const parts = splitMessage(response.privateText);
    await sendPrivate(message, parts);
    await sendToThread(message, parts);
  }

  if (response.publicText.length > 0 || response.privateText.length > 0) {
    void options.tables.persist().catch((e) => console.error('Failed to persist tables', e));
  }
}

async function send(channel: TextBasedChannel, content: string): Promise<void> {
  if (!channel.isSendable()) return;
  try {
    await channel.send(content);
  } catch (error) {
    console.error('Could not send message', error);
  }
}

async function sendPrivate(message: Message, parts: string[]): Promise<void> {
  try {
    const dm = await message.author.createDM();
    for (const part of parts) await dm.send(part);
  } catch (error) {
    // Most often the user blocks DMs from server members. Logged, never silent.
    console.warn(`Could not DM ${message.author.id}:`, error);
  }
}

/**
 * Mirrors the private reply into a thread on the command message. Skipped safely when threads are
 * impossible (DM channel, already inside a thread) or not permitted.
 */
async function sendToThread(message: Message, parts: string[]): Promise<void> {
  if (!message.inGuild()) return;
  if (message.channel.isThread()) return;

  try {
    const existing = message.thread;
    const thread =
      existing ??
      (await message.startThread({
        name: threadName(message.content),
        autoArchiveDuration: 1440,
      }));
    for (const part of parts) await thread.send(part);
  } catch (error) {
    console.warn(`Could not create or post to thread on ${message.id}:`, error);
  }
}

function threadName(content: string): string {
  const trimmed = content.trim();
  const name = trimmed.length === 0 ? 'SavageBot' : trimmed;
  return name.length > THREAD_NAME_LIMIT
    ? `${name.substring(0, THREAD_NAME_LIMIT - 1)}…`
    : name;
}
