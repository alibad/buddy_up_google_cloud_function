const { App, ExpressReceiver, LogLevel, WorkflowStep } = require('@slack/bolt');
const { Firestore } = require('@google-cloud/firestore');
const functions = require('firebase-functions');

const firestore = new Firestore();

const expressReceiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/events',
    processBeforeResponse: true,
});

const app = new App({
    receiver: expressReceiver,
    token: process.env.SLACK_BOT_TOKEN,
    processBeforeResponse: true,
    logLevel: LogLevel.DEBUG,
});

// Global error handler
app.error(console.error);

// Listens to incoming global shortcut requests from Slack with the callback_id of "buddy_up"
app.shortcut('buddy_up', async ({ shortcut, ack, client }) => {
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

app.command('/buddy_up', async ({ command, ack, respond, client }) => {
    try {
        await ack();

        const selectedChannel = command.channel_id;
        const profiles = await getProfiles(client, selectedChannel);
        const outputMessage = matchMembersByTimeZone(profiles);

        await client.chat.postMessage({
            channel: selectedChannel,
            text: outputMessage,
        });
    } catch (error) {
        console.error('Error handling /buddy_up command:', error);
        respond({
            text: 'An error occurred while processing the /buddy_up command.',
            response_type: 'ephemeral',
        });
    }
});

app.view('channel_select_modal', async ({ ack, view, client }) => {
    try {
        await ack();

        const selectedChannel = view.state.values.channel_select_block.channel_select.selected_conversation;
        const profiles = await getProfiles(client, selectedChannel);
        const outputMessage = matchMembersByTimeZone(profiles);

        await client.chat.postMessage({
            channel: selectedChannel,
            text: outputMessage,
        });
    } catch (error) {
        console.error('Error handling view submission:', error);
    }
});

async function getProfiles(client, channel) {
    const res = await client.conversations.members({ channel });
    const members = res.members;

    const profiles = [];
    for (const memberId of members) {
        const profileRes = await client.users.profile.get({ user: memberId });
        if (!profileRes.profile.bot_id) {
            profiles.push({
                id: memberId,
                tzOffset: profileRes.profile.tz_offset,
                name: profileRes.profile.real_name,
            });
        }
    }

    return profiles;
}

function matchMembersByTimeZone(profiles) {
    // Sort the list of profiles by timezone offset
    profiles.sort((a, b) => a.tzOffset - b.tzOffset);

    // Pair up members who are farthest apart in timezone and create the output message
    let outputMessage = '';
    const memberInfoList = [];

    while (profiles.length > 1) {
        const member1 = profiles.shift(); // Get and remove the first member in the list
        const member2 = profiles.pop();   // Get and remove the last member in the list

        outputMessage += `* <@${member1.id}> matched with <@${member2.id}>. <@${member1.id}>, you are in charge of scheduling the 1-1.\n`;
        memberInfoList.push({ name: member1.name, tzOffset: member1.tzOffset });
        memberInfoList.push({ name: member2.name, tzOffset: member2.tzOffset });
    }

    // If there's one member left, they couldn't be paired with anyone
    if (profiles.length === 1) {
        const member = profiles[0];
        outputMessage += `* <@${member.id}> couldn't be paired with anyone.\n`;
        memberInfoList.push({ name: member.name, tzOffset: member.tzOffset });
    }

    return outputMessage;
}

const budddyUpWorkflowStep = new WorkflowStep('buddy_up', {
    edit: async ({ ack, configure }) => {
        await ack();

        const blocks = [
            {
                "type": "input",
                "block_id": "selected_channel_block",
                "element": {
                    "type": "conversations_select",
                    "placeholder": {
                        "type": "plain_text",
                        "text": "Select a channel",
                        "emoji": true
                    },
                    "action_id": "selected_channel_action"
                },
                "label": {
                    "type": "plain_text",
                    "text": "Channel",
                    "emoji": true
                }
            }
        ];

        await configure({ blocks });
    },
    save: async ({ ack, step, view, update, client }) => {
        await ack();

        const selectedChannel = view.state.values.selected_channel_block.selected_channel_action.selected_conversation;

        // Set the selected channel in Firestore
        await setInFirestore(step.step_id, { channel: selectedChannel });

        const profiles = await getProfiles(client, selectedChannel);
        const inputs = { channel: { value: selectedChannel }, members: { value: profiles } };
        const outputs = [{ name: "message", type: "text", label: "Matched Pairs" }];
        await update({ inputs, outputs });
    },
    execute: async ({ step, complete, client }) => {
        const config = await getFromFirestore(step.step_id);
        const channel = config.channel;

        const profiles = await getProfiles(client, channel);
        const outputMessage = matchMembersByTimeZone(profiles);

        complete({ outputs: { message: outputMessage, members: profiles } });

        // Send message to the channel
        try {
            await client.chat.postMessage({
                token: process.env.SLACK_BOT_TOKEN,
                channel: channel,
                text: outputMessage,
            });
        } catch (error) {
            console.error(error);
        }
    },
});

app.step(budddyUpWorkflowStep);

// Function to set data in Firestore
async function setInFirestore(key, data) {
    const documentRef = firestore.collection('slack-ws').doc(key);
    await documentRef.set(data);
}

// Function to get data from Firestore
async function getFromFirestore(key) {
    const documentRef = firestore.collection('slack-ws').doc(key);
    const documentSnapshot = await documentRef.get();
    if (documentSnapshot.exists) {
        return documentSnapshot.data();
    }
    return null;
}

// https://{your domain}.cloudfunctions.net/slack/events
exports.slack = functions.https.onRequest(expressReceiver.app);
