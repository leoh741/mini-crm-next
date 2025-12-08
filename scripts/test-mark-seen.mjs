// Script de prueba para verificar que messageFlagsAdd funciona correctamente
// Uso: node scripts/test-mark-seen.mjs <UID>
// Ejemplo: node scripts/test-mark-seen.mjs 123

import { ImapFlow } from "imapflow";
import { emailConfig } from "../lib/emailConfig.js";

const uid = Number(process.argv[2] || 0);

if (!uid || isNaN(uid)) {
  console.error("❌ Pasá un UID válido como argumento");
  console.error("   Uso: node scripts/test-mark-seen.mjs <UID>");
  console.error("   Ejemplo: node scripts/test-mark-seen.mjs 123");
  process.exit(1);
}

console.log(`🧪 Test: Marcar como leído UID ${uid}`);
console.log(`📧 Config IMAP: ${emailConfig.host}:${emailConfig.imapPort}`);

const client = new ImapFlow({
  host: emailConfig.host,
  port: emailConfig.imapPort,
  secure: emailConfig.secure,
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
  },
  logger: false,
});

(async () => {
  try {
    console.log("\n1️⃣ Conectando a IMAP...");
    await client.connect();
    console.log("✅ Conectado exitosamente");

    console.log("\n2️⃣ Abriendo INBOX...");
    await client.mailboxOpen("INBOX");
    console.log("✅ INBOX abierto exitosamente");

    console.log(`\n3️⃣ Leyendo flags ANTES de marcar para UID ${uid}...`);
    let msgBefore = await client.fetchOne(uid, { flags: true }, { uid: true });
    const flagsBefore = msgBefore?.flags ? Array.from(msgBefore.flags) : [];
    const seenBefore = flagsBefore.includes("\\Seen");
    console.log(`   Flags: ${JSON.stringify(flagsBefore)}`);
    console.log(`   Seen: ${seenBefore}`);

    if (seenBefore) {
      console.log("\n⚠️  El correo ya está marcado como leído. Desmarcando primero...");
      await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
      await new Promise((r) => setTimeout(r, 500));
      
      msgBefore = await client.fetchOne(uid, { flags: true }, { uid: true });
      const flagsBefore2 = msgBefore?.flags ? Array.from(msgBefore.flags) : [];
      console.log(`   Flags después de desmarcar: ${JSON.stringify(flagsBefore2)}`);
    }

    console.log(`\n4️⃣ Agregando \\Seen a UID ${uid}...`);
    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    console.log("✅ Flag \\Seen agregado");

    console.log("\n5️⃣ Esperando 500ms...");
    await new Promise((r) => setTimeout(r, 500));

    console.log(`\n6️⃣ Leyendo flags DESPUÉS de marcar para UID ${uid}...`);
    let msgAfter = await client.fetchOne(uid, { flags: true }, { uid: true });
    const flagsAfter = msgAfter?.flags ? Array.from(msgAfter.flags) : [];
    const seenAfter = flagsAfter.includes("\\Seen");
    console.log(`   Flags: ${JSON.stringify(flagsAfter)}`);
    console.log(`   Seen: ${seenAfter}`);

    console.log("\n📊 Resultado:");
    if (seenAfter && !seenBefore) {
      console.log("✅ ÉXITO: El correo se marcó como leído correctamente en el servidor IMAP");
      console.log("   Verificá en tu webmail que el correo aparece como leído");
    } else if (seenAfter && seenBefore) {
      console.log("⚠️  El correo ya estaba marcado como leído");
    } else {
      console.log("❌ ERROR: El correo NO se marcó como leído");
      console.log("   Posibles causas:");
      console.log("   - UID incorrecto (no corresponde a ese mailbox)");
      console.log("   - Config IMAP incorrecta (otra cuenta, otra casilla)");
      console.log("   - Restricción del servidor IMAP");
    }

    await client.logout();
    console.log("\n✅ Cliente IMAP desconectado");
  } catch (err) {
    console.error("\n❌ ERROR test-mark-seen:", err.message);
    console.error("   Stack:", err.stack);
    try {
      await client.logout();
    } catch (_) {}
    process.exit(1);
  }
})();

