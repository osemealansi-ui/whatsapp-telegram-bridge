// ==================== WhatsApp to Telegram Bridge (Fixed Timeout) ====================
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

    // استخدام أحدث إصدار متاح تلقائياً
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📦 إصدار Baileys المستخدم: ${version}`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "trace" }), // زيادة مستوى السجلات للتشخيص
      printQRInTerminal: false,
      // ======== تحسينات الاتصال ========
      connectTimeoutMs: 120000,  // دقيقتين بدل 20 ثانية
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 2000,
      maxRetries: 10,
      browser: ["WhatsApp Bridge", "Chrome", "1.0.0"], // تعريف المتصفح لتجنب الحظر
    });

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 20;

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        console.log("⏳ جاري الاتصال بالواتساب...");
        console.log(`   المحاولة رقم: ${reconnectAttempts + 1}`);
      }

      if (connection === "open") {
        console.log("✅ تم فتح اتصال واتساب بنجاح!");
        reconnectAttempts = 0; // إعادة تعيين العداد

        // ==================== طلب كود الاقتران ====================
        if (!sock.authState.creds.registered) {
          console.log("⏳ انتظار 3 ثوان لاستقرار الاتصال...");

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
              console.log("⏳ بانتظار إدخال الكود...");
              console.log("═══════════════════════════════════");
            } catch (err) {
              console.error("❌ خطأ في طلب كود الاقتران:", err.message);
              console.error("   التفاصيل الكاملة:", JSON.stringify(err, null, 2));
            }
          }, 3000);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log("⚠️ انقطع اتصال واتساب...");
        console.log(`   كود الحالة: ${statusCode || "غير معروف"}`);

        if (statusCode === 408) {
          console.log("⏱️ انتهت مهلة الاتصال (Timeout 408).");
          console.log("   قد يكون السيرفر بعيداً عن سيرفرات واتساب.");
          console.log("   جاري إعادة المحاولة...");
        }

        if (statusCode === 401) {
          console.log("🔧 جلسة غير صالحة. جاري تنظيف الجلسة...");
          const fs = require("fs");
          const path = require("path");
          const authPath = path.join(__dirname, "auth_info");
          if (fs.existsSync(authPath)) {
            try {
              fs.rmSync(authPath, { recursive: true, force: true });
              console.log("✅ تم حذف الجلسة القديمة.");
            } catch (e) {
              console.log("⚠️ فشل حذف الجلسة:", e.message);
            }
          }
          reconnectAttempts = 0;
        }

        if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(5000 * reconnectAttempts, 60000); // تأخير متزايد حتى 60 ثانية
          console.log(`🔄 إعادة المحاولة بعد ${delay / 1000} ثوان... (${reconnectAttempts}/${maxReconnectAttempts})`);
          setTimeout(() => {
            startWhatsApp();
          }, delay);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          console.log("❌ تم الوصول للحد الأقصى للمحاولات. توقف.");
        } else {
          console.log("❌ تم تسجيل الخروج. جاري إعادة التشغيل...");
          setTimeout(() => {
            reconnectAttempts = 0;
            startWhatsApp();
          }, 15000);
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
    console.log("🔄 إعادة المحاولة بعد 15 ثوان...");
    setTimeout(() => {
      startWhatsApp();
    }, 15000);
  }
}

// ==================== بدء التشغيل ====================
console.log("═══════════════════════════════════");
console.log("🤖 نظام ربط واتساب ↔ تلغرام");
console.log("   © الهندسة المدنية");
console.log("═══════════════════════════════════");
console.log("🚀 جاري بدء التشغيل...");
console.log("");

startWhatsApp();
