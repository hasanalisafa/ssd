require('dotenv').config();  // Load .env variables

const puppeteer = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const TelegramBot = require('node-telegram-bot-api');

// Using direct values from your provided code for API_KEY, TOKEN, etc.
const CODIGO = '202502281517043876'; // Your "Código"
const NASCIMENTO = '05/05/1979';     // Your "Data de nascimento"
const URL = 'https://servicos.dpf.gov.br/agenda-web/acessar';
const API_KEY = '3b939b4b7093b70ef59defb145ebd27f'; // Your 2Captcha API Key
const TOKEN = '7595568390:AAFtnPI2exN6kmL_giSz8GgbatooJhVPGcA'; // Your Telegram Bot Token
const chatId = '5316684496'; // Your Telegram chat ID

puppeteer.use(
  RecaptchaPlugin({
    provider: { id: '2captcha', token: API_KEY },
    visualFeedback: true,
  })
);

const bot = new TelegramBot(TOKEN);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();

  while (true) {
    await page.goto(URL, { waitUntil: 'networkidle2' });

    console.log("Waiting for site to fully load...");
    await new Promise(res => setTimeout(res, 8000));

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

    const waitTime = 15000 + Math.floor(Math.random() * 5000); // 15–20 sec
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

    // التحقق من وجود زر Confirmar
    const confirmarExists = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).some(el =>
        el.innerText.toLowerCase().includes('confirmar')
      );
    });

    if (!confirmarExists) {
      console.log("No 'Confirmar' button yet. Clicking on page to trigger popup...");
      await page.mouse.click(200, 200);

      // الانتظار حتى يظهر زر Confirmar
      console.log("Waiting for 'Confirmar' button to appear...");
      await page.waitForSelector('a', { visible: true, timeout: 35000 });
    } else {
      console.log("'Confirmar' button already exists — no need to click page.");
    }

    // الانتظار 15 ثانية بعد الضغط على Confirmar
    console.log("Waiting 15 seconds before clicking Confirmar...");
    await new Promise(res => setTimeout(res, 15000));

    // الضغط على Confirmar
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

    // الانتظار 40 ثانية قبل التحقق من الـ popup
    console.log("Waiting 40 seconds before checking for popup...");
    await new Promise(res => setTimeout(res, 40000));

    console.log("Waiting for potential popup...");
    const okBtn = await page.$('p-confirmdialog button');
    if (okBtn) {
      console.log("Popup appeared. Clicking OK...");
      await okBtn.click();
      await new Promise(res => setTimeout(res, 10000)); // ننتظر 10 ثواني بعد الضغط
    } else {
      console.log("No popup appeared. Continuing...");
    }

    // فحص وجود مواعيد في الكاليندر
    console.log("Checking calendar for available days...");
    const availableDates = await page.$$eval('td span', spans => {
      return spans.filter(span => {
        const parent = span.closest('td');
        return parent && parent.classList.contains('ui-datepicker-selectable-day');
      }).map(span => span.textContent.trim());
    });

    // If available dates are found, ask the user to confirm the booking
    if (availableDates.length > 0) {
      console.log("Appointments found on days:", availableDates);
      await bot.sendMessage(chatId, `تم العثور على مواعيد متاحة في الأيام التالية: ${availableDates.join(', ')}`);
      await bot.sendMessage(chatId, 'هل ترغب في حجز موعد؟ (نعم أو لا)');
      
      bot.on('message', async (msg) => {
        if (msg.text.toLowerCase() === 'نعم') {
          console.log('User confirmed. Booking the appointment...');

          // Select the available date and time (you can modify the time selection logic as needed)
          await page.click('td span:contains("2")'); // Example for selecting a date
          await page.click('button:contains("9:00")'); // Example for selecting a time

          console.log('Time selected. Pressing "Agendar"...');
          await page.click('button:contains("Agendar")'); // Example for pressing "Agendar"

          // Wait for the confirmation popup and click 'Confirmar'
          console.log('Waiting for confirmation popup...');
          await new Promise(res => setTimeout(res, 25000)); // Wait for 25 seconds

          const confirmButton = await page.$('button:contains("Confirmar")');
          if (confirmButton) {
            console.log('Confirmation found. Pressing "Confirmar"...');
            await confirmButton.click();
            
            await bot.sendMessage(chatId, 'تم تأكيد الحجز بنجاح.');
            await page.screenshot({ path: 'booking_confirmation.png' });
            await bot.sendPhoto(chatId, 'booking_confirmation.png'); // Send screenshot

            // Stop further checks
            process.exit();
          }
        } else if (msg.text.toLowerCase() === 'لا') {
          console.log('User declined. Continuing search for available appointments...');
          // The script will continue searching for appointments
        }
      });
    } else {
      console.log("No available appointments in calendar.");
      
      // Wait 15 seconds before taking the screenshot
      console.log('Waiting 15 seconds before taking screenshot...');
      await new Promise(res => setTimeout(res, 15000));

      // Take screenshot after no appointments
      await page.screenshot({ path: 'no_appointments.png' });
      await bot.sendMessage(chatId, 'لا يوجد موعد متاح حالياً في التقويم.');
      await bot.sendPhoto(chatId, 'no_appointments.png'); // Send screenshot

      // Wait before trying again
    }

    console.log("انتظار 15 دقيقة قبل المحاولة التالية...");
    await new Promise(res => setTimeout(res, 900000)); // 15 دقيقة
  }
})();