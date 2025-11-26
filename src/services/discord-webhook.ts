const { Webhook, MessageBuilder } = require('discord-webhook-node');

const hook = new Webhook(process.env.WEBHOOK_URL);
hook.setUsername('dotcreator');

type Severity = 'error' | 'info' | 'warning';

export function sendDiscordMessage(title: string, message: string, severity: Severity) {
  let embed: any = {};

  const getMessageColor = (s: Severity): string => {
    if (s === 'error') return '#FA4545';
    else if (s === 'info') return '#7ffa45';
    else if (s === 'warning') return '#fad245';
    else return '#2e2e2e';
  };

  embed = new MessageBuilder()
    .setColor(getMessageColor(severity))
    .setTitle(`galatea: ${title.toLocaleLowerCase()}`)
    .setDescription(message)
    .setTimestamp();

  hook.send(embed);
}
