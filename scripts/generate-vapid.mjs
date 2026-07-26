// Generates the VAPID keypair used to sign web push messages.
//   node scripts/generate-vapid.mjs
// Paste the printed values into Vercel's environment variables. The PRIVATE
// key must never be committed or exposed to the browser.
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('\nAdd these to Vercel → Settings → Environments → Production:\n')
console.log('VITE_VAPID_PUBLIC_KEY =', keys.publicKey)
console.log('VAPID_PUBLIC_KEY      =', keys.publicKey)
console.log('VAPID_PRIVATE_KEY     =', keys.privateKey)
console.log('VAPID_SUBJECT         = mailto:your@email.com')
console.log('\nKeep the private key secret. Never commit it.\n')
