export default {
  name: 'echo-plugin',
  version: '1.0.0',
  commands: [
    {
      name: 'echo',
      aliases: ['say'],
      description: 'Echo back the provided text',
      usage: '.echo <text>',
      ownerOnly: false,
      groupOnly: false,
      async run({ sock, msg, from, args }) {
        const text = args.join(' ').trim()
        await sock.sendMessage(from, { text: text || '⚪ Echo: nothing to say.' }, { quoted: msg })
      },
    },
  ],
}
