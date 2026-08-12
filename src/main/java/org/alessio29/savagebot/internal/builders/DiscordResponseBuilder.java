package org.alessio29.savagebot.internal.builders;

import net.dv8tion.jda.api.entities.Message;
import net.dv8tion.jda.api.entities.MessageChannel;
import net.dv8tion.jda.api.entities.User;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.util.List;

public class DiscordResponseBuilder extends SplittingResponseBuilder {
    public final static int MESSAGE_LENGTH_LIMIT = 2000;

    public final static int MESSAGE_PARTS_LIMIT = 3;

    /** Discord caps thread names at 100 characters. */
    private final static int THREAD_NAME_LIMIT = 100;

    private static final Logger log = LogManager.getLogger(DiscordResponseBuilder.class);

    private final User user;
    private final MessageChannel channel;
    /** The message that triggered this response; null when unavailable. */
    private final Message sourceMessage;

    public DiscordResponseBuilder(User user, MessageChannel channel) {
        this(user, channel, null);
    }

    public DiscordResponseBuilder(User user, MessageChannel channel, Message sourceMessage) {
        super(MESSAGE_LENGTH_LIMIT);
        this.user = user;
        this.channel = channel;
        this.sourceMessage = sourceMessage;
    }

    @Override
    protected void sendReplyPartsToOrigin(List<String> parts) {
        if (parts.size() > MESSAGE_PARTS_LIMIT) {
            super.sendReplyPartsToOrigin(parts.subList(0, MESSAGE_PARTS_LIMIT));
            sendReplyToOrigin(
                    "...and so on. Command result is too long. " +
                    "If you really want to do such thing, you can send commands to bot privately."
            );
            return;
        }
        super.sendReplyPartsToOrigin(parts);
    }

    @Override
    protected void sendReplyToOrigin(String message) {
        channel.sendMessage(message).queue();
    }

    @Override
    protected void sendPrivateReply(String message) {
        user.openPrivateChannel().queue(
                privateChannel -> privateChannel.sendMessage(message).queue(
                        null,
                        error -> log.warn("Could not send private reply to {}", user.getId(), error)
                ),
                error -> log.warn("Could not open private channel with {}", user.getId(), error)
        );
    }

    /**
     * Private responses go to the user's DMs *and* into a thread hanging off the
     * command message, so the rest of the table can read them without the reply
     * flooding the channel. The DM is sent regardless -- if thread creation is
     * not possible (DM channel, already inside a thread, or missing the
     * Create Public Threads / Send Messages in Threads permissions) the DM
     * still lands, and the reason is logged rather than swallowed.
     */
    @Override
    protected void sendPrivateParts(List<String> parts) {
        super.sendPrivateParts(parts);
        sendPartsToThread(parts);
    }

    private void sendPartsToThread(List<String> parts) {
        if (sourceMessage == null || parts.isEmpty()) {
            return;
        }
        if (!sourceMessage.isFromGuild() || sourceMessage.getChannelType().isThread()) {
            // Threads can only hang off a top-level guild message.
            return;
        }
        if (sourceMessage.getStartedThread() != null) {
            // A message can own at most one thread; reuse the existing one.
            sendPartsToChannel(sourceMessage.getStartedThread(), parts);
            return;
        }

        String name = buildThreadName();
        sourceMessage.createThreadChannel(name).queue(
                thread -> sendPartsToChannel(thread, parts),
                error -> log.warn("Could not create thread on message {}", sourceMessage.getId(), error)
        );
    }

    private void sendPartsToChannel(MessageChannel target, List<String> parts) {
        for (String part : parts) {
            target.sendMessage(part).queue(
                    null,
                    error -> log.warn("Could not send message to thread {}", target.getId(), error)
            );
        }
    }

    private String buildThreadName() {
        String contents = sourceMessage.getContentDisplay().trim();
        String name = contents.isEmpty() ? "SavageBot" : contents;
        if (name.length() > THREAD_NAME_LIMIT) {
            name = name.substring(0, THREAD_NAME_LIMIT - 1) + "…";
        }
        return name;
    }

    @Override
    protected String getUserMention() {
        return user.getAsMention();
    }
}