const { App, ExpressReceiver, LogLevel } = require('@slack/bolt');

const functions = require('firebase-functions');

const expressReceiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/events',
    processBeforeResponse: true,
});

const app = new App({
    receiver: expressReceiver,
    token: process.env.SLACK_BOT_TOKEN,
    processBeforeResponse: true,
    logLevel: LogLevel.DEBUG, // Enable debug logging for development
});

// Global error handler
app.error(console.error);

// Listens to incoming global shortcut requests from Slack with the callback_id of "buddy_up"
app.shortcut('buddy_up', async ({ shortcut, ack, client, context }) => {
    console.log('buddy_up shortcut invoked.');

    try {
        // Acknowledge the shortcut request
        await ack();

        // Open a channel selector modal
        const result = await await client.views.open({
            trigger_id: shortcut.trigger_id,
            view: {
                type: 'modal',
                callback_id: 'channel_select_modal',
                title: {
                    type: 'plain_text',
                    text: 'Select a channel'
                },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'channel_select_block',
                        label: {
                            type: 'plain_text',
                            text: 'Channel'
                        },
                        element: {
                            type: 'conversations_select',
                            placeholder: {
                                type: 'plain_text',
                                text: 'Select a channel'
                            },
                            action_id: 'channel_select'
                        }
                    }
                ],
                submit: {
                    type: 'plain_text',
                    text: 'Submit'
                }
            }
        });

        console.log('Channel selector modal opened:', result);
    } catch (error) {
        console.error('Error opening channel selector modal:', error);
    }
});

// Listens to view submission events
app.view('channel_select_modal', async ({ ack, view, client, body }) => {
    // Acknowledge the view submission
    await ack();

    console.log('Channel selection submitted:', view);

    try {
        const selectedChannel = view.state.values.channel_select_block.channel_select.selected_conversation;
        const userId = body.user.id; 

        // Send a message to the selected channel
        await client.chat.postMessage({
            channel: selectedChannel,
            text: `Hello <@${userId}>! This message was sent from the buddy_up shortcut.`,
        });
    } catch (error) {
        console.error('Error handling view submission:', error);
    }
});

// https://{your domain}.cloudfunctions.net/slack/events
exports.slack = functions.https.onRequest(expressReceiver.app);
