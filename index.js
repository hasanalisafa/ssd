const puppeteer = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

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

// ✅ Auto-restart on crash
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error(err.stack);
  setTimeout(() => {
    console.log('🔁 Restarting script in 5 seconds...');
    process.exit(1);
  }, 5000);
});

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  while (true) {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    console.log("Waiting for site to fully load...");
    await new Promise(res => setTimeout(res, 8000));

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
    await new Promise(res => setTimeout(res, waitTime));

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
    await new Promise(res => setTimeout(res, 14000));

    console.log("Waiting for second reCAPTCHA iframe...");
    await page.waitForSelector('iframe[src*="recaptcha"]', { visible: true, timeout: 15000 });

    console.log("Solving second reCAPTCHA...");
    await page.solveRecaptchas();

    console.log("Second reCAPTCHA solved. Waiting 20 seconds...");
    await new Promise(res => setTimeout(res, 20000));

    const confirmarExists = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).some(el =>
        el.innerText.toLowerCase().includes('confirmar')
      );
    });

    if (!confirmarExists) {
      console.log("No 'Confirmar' button yet. Clicking on page to trigger popup...");
      await page.mouse.click(200, 200);
      console.log("Waiting for 'Confirmar' button to appear...");
      await page.waitForSelector('a', { visible: true, timeout: 35000 });
    } else {
      console.log("'Confirmar' button already exists — no need to click page.");
    }

    console.log("Waiting 15 seconds before clicking Confirmar...");
    await new Promise(res => setTimeout(res, 15000));

    console.log("Pressing Confirmar button...");
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      for (let link of links) {
        if (link.innerText.toLowerCase().includes('confirmar')) {
          link.click();
          console.log("Confirmar clicked via evaluate.");
          break;
        }
      }
    });

    console.log("Waiting 40 seconds before checking for popup...");
    await new Promise(res => setTimeout(res, 40000));

    console.log("Waiting for potential popup...");
    const okBtn = await page.$('p-confirmdialog button');
    if (okBtn) {
      console.log("Popup appeared. Clicking OK...");
      await okBtn.click();
      await new Promise(res => setTimeout(res, 10000));
    } else {
      console.log("No popup appeared. Continuing...");
    }

    console.log("Checking calendar for available days...");
    const availableDates = await page.$$eval('td span', spans => {
      return spans.filter(span => {
        const parent = span.closest('td');
        return parent && parent.classList.contains('ui-datepicker-selectable-day');
      }).map(span => span.textContent.trim());
    });

    if (availableDates.length > 0) {
      console.log("Appointments found on days:", availableDates);
      await bot.sendMessage(chatId, `تم العثور على مواعيد متاحة في الأيام التالية: ${availableDates.join(', ')}`);
      await page.screenshot({ path: 'available.png', fullpage: true });
      await bot.sendPhoto(chatId, fs.createReadStream('available.png'));
    } else {
      console.log("No available appointments in calendar.");
      await bot.sendMessage(chatId, '❌ لا يوجد موعد متاح حالياً في التقويم.');
      await page.screenshot({ path: 'no_appointments.png', fullpage: true });
      await bot.sendPhoto(chatId, fs.createReadStream('no_appointments.png'));
    }

    console.log("🔁 انتظار 5 دقائق قبل المحاولة التالية...");
    await new Promise(res => setTimeout(res, 300000)); // 5 دقائق
  }
})();