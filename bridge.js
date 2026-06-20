// ==================== WhatsApp to Telegram Bridge (Render Fixed) ====================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const { Telegraf } = require("telegraf");
const pino = require("pino");
const http = require("http");

// ==================== سيرفر وهمي لمنع Render من إغلاق التطبيق ====================
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running ✅");
});
server.listen(PORT, () => {
  console.log(`🌐 سيرفر المنفذ يعمل على: ${PORT}`);
});

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
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    console.log(`📦 إصدار Baileys: ${version}`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        console.log("⏳ جاري الاتصال بالواتساب...");
      }

      if (connection === "open") {
        console.log("✅ تم فتح اتصال واتساب بنجاح!");

        // ==================== تأخير طلب كود الاقتران لضمان استقرار الاتصال ====================
        if (!sock.authState.creds.registered) {
          console.log("⏳ انتظار 5 ثوان لاستقرار الاتصال قبل طلب كود الاقتران...");

          setTimeout(async () => {
            try {
              console.log("═══════════════════════════════════");
              console.log("📱 جاري طلب كود الاقتران...");
              console.log(`📞 رقم الهاتف: ${PHONE_NUMBER}`);
              console.log("═══════════════════════════════════");

              const code = await sock.requestPairingCode(PHONE_NUMBER);

              console.log("");
              console.log("═══════════════════════════════════");
              console.log(`🔢 كود الاقتران الخاص بك: ${code}`);
              console.log("═══════════════════════════════════");
              console.log("");
              console.log("📲 اتبع الخطوات على هاتفك:");
              console.log("   1️⃣ افتح واتساب");
              console.log("   2️⃣ الإعدادات ⚙️");
              console.log("   3️⃣ الأجهزة المرتبطة");
              console.log("   4️⃣ ربط جهاز");
              console.log("   5️⃣ الربط برقم الهاتف");
              console.log(`   6️⃣ أدخل الكود: ${code}`);
              console.log("");
              console.log("⏳ بانتظار إدخال الكود على الهاتف...");
              console.log("═══════════════════════════════════");
            } catch (err) {
              console.error("❌ خطأ في طلب كود الاقتران:", err.message);
              console.error("   جاري إعادة المحاولة تلقائياً...");
              // إعادة المحاولة بعد 30 ثانية
              setTimeout(() => {
                console.log("🔄 إعادة محاولة طلب كود الاقتران...");
              }, 30000);
            }
          }, 5000);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log("⚠️ انقطع اتصال واتساب...");
        console.log(`   كود الحالة: ${statusCode || "غير معروف"}`);

        if (statusCode === 401) {
          console.log("🔧 تم اكتشاف خطأ 401 (جلسة غير صالحة).");
          console.log("   سيتم حذف الجلسة القديمة وإعادة المحاولة...");

          // محاولة تنظيف الجلسة
          const fs = require("fs");
          const path = require("path");
          const authPath = path.join(__dirname, "auth_info");
          if (fs.existsSync(authPath)) {
            try {
              fs.rmSync(authPath, { recursive: true, force: true });
              console.log("✅ تم حذف مجلد الجلسة القديم.");
            } catch (e) {
              console.log("⚠️ لم يتم حذف مجلد الجلسة:", e.message);
            }
          }
        }

        if (shouldReconnect) {
          console.log("🔄 جاري إعادة الاتصال بعد 5 ثوان...");
          setTimeout(() => {
            startWhatsApp();
          }, 5000);
        } else {
          console.log("❌ تم تسجيل الخروج بالكامل. جاري إعادة التشغيل...");
          setTimeout(() => {
            startWhatsApp();
          }, 10000);
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
        console.log(`⏩ تم تجاهل: ${groupName}`);
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

    return sock;
  } catch (err) {
    console.error("❌ خطأ في بدء تشغيل واتساب:", err.message);
    console.log("🔄 إعادة المحاولة بعد 10 ثوان...");
    setTimeout(() => {
      startWhatsApp();
    }, 10000);
  }
}

// ==================== بدء التشغيل ====================
console.log("═══════════════════════════════════");
console.log("🤖 نظام ربط واتساب ↔ تلغرام");
console.log("   © الهندسة المدنية - Render");
console.log("═══════════════════════════════════");
console.log("🚀 جاري بدء التشغيل...");
console.log("");

startWhatsApp();
