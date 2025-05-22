const puppeteer = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const TelegramBot = require('node-telegram-bot-api');

const CODIGO = '202503171225051758';
const NASCIMENTO = '19/05/1988';
const URL = 'https://servicos.dpf.gov.br/agenda-web/acessar';
const API_KEY = '3b939b4b7093b70ef59defb145ebd27f';
const TOKEN = '7595568390:AAFtnPI2exN6kmL_giSz8GgbatooJhVPGcA';
const chatId = '5316684496';

puppeteer.use(
  RecaptchaPlugin({
    provider: { id: '2captcha', token: API_KEY },
    visualFeedback: true,
  })
);

const bot = new TelegramBot(TOKEN);

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  while (true) {
    try {
      await page.goto(URL, { waitUntil: 'networkidle2' });
      console.log("Waiting for site to fully load...");
      await page.waitForTimeout(8000);

      // اختيار خدمة Migração
      await page.waitForSelector('.ui-dropdown', { visible: true });
      await page.click('.ui-dropdown');
      await page.waitForSelector('ul.ui-dropdown-items li');
      const options = await page.$$('ul.ui-dropdown-items li');
      for (const option of options) {
        const text = await page.evaluate(el => el.innerText, option);
        if (text.includes('Migração')) {
          await option.click();
          break;
        }
      }

      // تعبئة البيانات
      await page.waitForSelector('input[placeholder="Código de solicitação ou Requerimento"]', { visible: true });
      await page.type('input[placeholder="Código de solicitação ou Requerimento"]', CODIGO);
      await page.type('input[placeholder="Data de nascimento"]', NASCIMENTO);

      console.log("Form filled. Solving reCAPTCHA...");
      await page.solveRecaptchas();

      console.log("reCAPTCHA solved. Submitting...");
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText, btn);
        if (text.trim().toLowerCase() === 'prosseguir') {
          await btn.click();
          console.log("Clicked first Prosseguir button");
          break;
        }
      }

      const waitTime = 15000 + Math.floor(Math.random() * 5000);
      console.log(`Waiting ${waitTime / 1000} seconds before clicking second Prosseguir...`);
      await page.waitForTimeout(waitTime);

      console.log("Preparing to click second Prosseguir...");
      const secondButtons = await page.$$('button');
      for (const btn of secondButtons) {
        const text = await page.evaluate(el => el.innerText, btn);
        if (text.trim().toLowerCase() === 'prosseguir') {
          await btn.click();
          console.log("Clicked second Prosseguir button to go to appointment page");
          break;
        }
      }

      console.log("Second Prosseguir clicked. Waiting 14 seconds before solving reCAPTCHA...");
      await page.waitForTimeout(14000);

      console.log("Waiting for second reCAPTCHA iframe...");
      await page.waitForSelector('iframe[src*="recaptcha"]', { visible: true, timeout: 15000 });

      console.log("Solving second reCAPTCHA...");
      await page.solveRecaptchas();

      console.log("Second reCAPTCHA solved. Waiting 20 seconds...");
      await page.waitForTimeout(20000);

      // انتظار زر Confirmar
      try {
        console.log("Waiting for 'Confirmar' button to appear...");
        await page.waitForXPath("//a[contains(text(), 'Confirmar')]", { visible: true, timeout: 60000 });

        const [confirmarButton] = await page.$x("//a[contains(text(), 'Confirmar')]");
        if (confirmarButton) {
          await confirmarButton.click();
          console.log("Clicked 'Confirmar' button.");
        } else {
          console.log("Could not find 'Confirmar' button.");
          continue;
        }
      } catch (err) {
        console.log("Timeout waiting for 'Confirmar' button. Skipping this round.");
        continue;
      }

      // الانتظار قبل التحقق من ظهور الـ popup
      console.log("Waiting 40 seconds before checking for popup...");
      await page.waitForTimeout(40000);

      const okBtn = await page.$('p-confirmdialog button');
      if (okBtn) {
        console.log("Popup appeared. Clicking OK...");
        await okBtn.click();
        await page.waitForTimeout(10000);
      } else {
        console.log("No popup appeared. Continuing...");
      }

      // فحص المواعيد المتاحة بشكل دقيق
      console.log("Checking calendar for available days...");
      const availableDates = await page.$$eval('td.ui-datepicker-selectable-day', tds =>
        tds.map(td => td.innerText.trim()).filter(text => text)
      );

      if (availableDates.length > 0) {
        console.log("Appointments found on days:", availableDates);
        await bot.sendMessage(chatId, `✅ تم العثور على مواعيد متاحة في الأيام التالية: ${availableDates.join(', ')}`);
        await page.screenshot({ path: 'available.png' });
        await bot.sendPhoto(chatId, 'available.png');
      } else {
        console.log("No available appointments in calendar.");
        await bot.sendMessage(chatId, '❌ لا يوجد موعد متاح حالياً في التقويم.');
        await page.screenshot({ path: 'no_appointments.png' });
        await bot.sendPhoto(chatId, 'no_appointments.png');
      }

      console.log("🔁 إعادة المحاولة فوراً...");
    } catch (err) {
      console.error("⚠️ حصل خطأ أثناء التنفيذ:", err.message);
    }
  }
})();