// ==================== WhatsApp to Telegram Bridge ====================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const { Telegraf } = require("telegraf");
const pino = require("pino");

// ==================== قراءة متغيرات البيئة ====================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const TELEGRAM_CHAT_ID = "-1004372808921";

// ==================== جدول المطابقة ====================
const GROUP_TOPIC_MAP = {
  "الإعلامات": 1,
  "هيدرولوجيا 1 (نظري)": 2,
  "التكاليف": 3,
  "طرق انشاء (نظري)": 4,
  "هيدروليك 1 ( مناقشة)": 6,
  "مساحة 1 (عملي)": 7,
  "هيدروليك 1 (نظري)": 8,
  "نظرية الإنشاءات 1 ( نظري)": 9,
  "ميكانيك التربة 1 (نظري)": 10,
  "ميكانيك التربة 1( مناقشة )": 11,
  "نظرية الإنشاءات 1 ( مناقشة)": 12,
  "الرسم الأنشائي 1 ( عملي)": 13,
  "ميكانيك التربة 1 (عملي)": 14,
  "مساحة 1 (نظري)": 15,
  "الرسم الأنشائي 1 (نظري)": 16,
};

// ==================== إعداد بوت تلغرام ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

async function sendToTelegram(text, topicId) {
  try {
    await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, text, {
      message_thread_id: topicId,
    });
  } catch (err) {
    console.error("خطأ في إرسال رسالة تلغرام:", err.message);
  }
}

async function sendMediaToTelegram(mediaBuffer, caption, topicId, isImage = true) {
  try {
    if (isImage) {
      await bot.telegram.sendPhoto(TELEGRAM_CHAT_ID, { source: mediaBuffer }, {
        caption: caption,
        message_thread_id: topicId,
      });
    } else {
      await bot.telegram.sendDocument(TELEGRAM_CHAT_ID, { source: mediaBuffer }, {
        caption: caption,
        message_thread_id: topicId,
      });
    }
  } catch (err) {
    console.error("خطأ في إرسال وسائط تلغرام:", err.message);
  }
}

// ==================== تشغيل واتساب ====================
async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("⏳ جاري الاتصال بالواتساب...");
    }

    if (connection === "open") {
      console.log("✅ تم ربط واتساب بنجاح!");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        "⚠️ انقطع اتصال واتساب...",
        shouldReconnect ? "جاري إعادة المحاولة" : "تم تسجيل الخروج"
      );
      if (shouldReconnect) {
        startWhatsApp();
      } else {
        console.log("🔄 تم تسجيل الخروج. احذف مجلد auth_info وأعد التشغيل.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ==================== استقبال الرسائل ====================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) return;

    let groupName = "غير معروف";
    try {
      const metadata = await sock.groupMetadata(remoteJid);
      groupName = metadata.subject || "غير معروف";
    } catch (e) {}

    const topicId = GROUP_TOPIC_MAP[groupName];
    if (!topicId) {
      console.log(`⏩ تم تجاهل رسالة من مجموعة: ${groupName}`);
      return;
    }

    let textContent = "";
    const messageTypes = Object.keys(msg.message);
    const firstType = messageTypes[0];

    if (firstType === "conversation") {
      textContent = msg.message.conversation;
    } else if (firstType === "extendedTextMessage") {
      textContent = msg.message.extendedTextMessage.text;
    } else if (firstType === "imageMessage") {
      textContent = msg.message.imageMessage.caption || "";
    } else if (firstType === "documentMessage") {
      textContent = msg.message.documentMessage.caption || "";
    } else if (firstType === "videoMessage") {
      textContent = msg.message.videoMessage.caption || "";
    }

    if (textContent) {
      const finalText = `📢 من ${groupName}:\n${textContent}`;
      await sendToTelegram(finalText, topicId);
      console.log(`✅ تم إرسال نص إلى الموضوع ${topicId} من ${groupName}`);
    }

    if (firstType === "imageMessage") {
      try {
        const media = await sock.downloadMediaMessage(msg);
        await sendMediaToTelegram(media, textContent, topicId, true);
        console.log(`✅ تم إرسال صورة إلى الموضوع ${topicId}`);
      } catch (e) {
        console.error("خطأ في تحميل الصورة:", e.message);
      }
    }

    if (firstType === "documentMessage" || firstType === "videoMessage") {
      try {
        const media = await sock.downloadMediaMessage(msg);
        await sendMediaToTelegram(media, textContent, topicId, false);
        console.log(`✅ تم إرسال ملف/فيديو إلى الموضوع ${topicId}`);
      } catch (e) {
        console.error("خطأ في تحميل الملف:", e.message);
      }
    }
  });

  // ==================== طلب كود الاقتران ====================
  if (!sock.authState.creds.registered) {
    console.log("📱 جاري طلب كود الاقتران...");
    console.log(`رقم الهاتف المستخدم: ${PHONE_NUMBER}`);
    try {
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      console.log(`\n🔢 كود الاقتران الخاص بك: ${code}\n`);
      console.log("📲 افتح واتساب على هاتفك:");
      console.log("   الإعدادات > الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف");
      console.log(`   أدخل الكود: ${code}\n`);
    } catch (err) {
      console.error("خطأ في طلب كود الاقتران:", err.message);
    }
  }

  return sock;
}

// ==================== بدء التشغيل ====================
console.log("🤖 جاري تشغيل نظام ربط واتساب ↔ تلغرام...");
startWhatsApp();
