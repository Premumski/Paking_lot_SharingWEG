/** Generates VAPID keys for Web Push; put them into .env */
import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
