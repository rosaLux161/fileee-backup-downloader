#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const {mkdtemp, readdir, rename} = require('fs/promises');

const puppeteer = require('puppeteer');
const readline = require('readline');

class FileeeBackupDownloader {
    static async run() {
        console.log('👋🏼 Okay, hi there.');
        console.log('   Let\' do some backups!');
        console.log('');

        const username = process.env.FILEEE_USERNAME;
        if(!username) {
            throw new Error('Unable to run: FILEEE_USERNAME not set.');
        }

        const password = process.env.FILEEE_PASSWORD;
        if(!password) {
            throw new Error('Unable to run: FILEEE_PASSWORD not set.');
        }

        this.logJobStart('⚙️', 'Launch virtual browser');
        const destination = process.env.BACKUP_DESTINATION || path.resolve(process.env.HOME, 'fileee-backup.zip');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        try {
            await this.execute({browser, page, username, password, destination});
        }
        catch(error) {
            this.logJobEnd();

            try {
                await page.screenshot({path: new Date().getTime() + '-error.png'});
                await browser.close();
            }
            catch(error) {
                console.log(error);
            }

            throw error;
        }
    }

    static async execute({browser, page, username, password, destination}) {
        this.logJobStart('🌍️', 'Open fileee web app');
        await page.goto('https://my.fileee.com/account');

        this.logJobStart('👤', 'Enter username');
        const $usernameInput = await page.waitForSelector('[name="username"]');
        await $usernameInput.type(username);
        await $usernameInput.press('Enter');

        this.logJobStart('🔑️', 'Enter password');
        const $passwordInput = await page.waitForSelector('[name="password"]');
        await $passwordInput.type(password);
        await $passwordInput.press('Enter');

        this.logJobStart('📑', 'Open download layer');
        const $downloadButton = await page.waitForSelector('.grid-noGutter-spaceBetween button');
        await page.waitForTimeout(100);
        await $downloadButton.click();
        await page.waitForTimeout(100);

        await Promise.race([
            page.waitForSelector('.ReactModalPortal input[type="password"]'),
            page.waitForSelector('.ReactModalPortal .mdc-typography--caption span')
        ]);

        const $confirmPasswordInput = await page.$('.ReactModalPortal input[type="password"]');
        if($confirmPasswordInput) {
            this.logJobStart('🔑', 'Enter password (again)');
            await $confirmPasswordInput.type(password);
            await $confirmPasswordInput.press('Enter');
        }

        this.logJobStart('🔄', 'Prepare download');
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fileee-download-'));
        await page._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tmpDir,
        });

        await page.waitForSelector('.ReactModalPortal .mdc-typography--caption span');
        const interval = setInterval(async () => {
            page.$eval('.ReactModalPortal .mdc-typography--caption span', s => s.textContent)
                .then(state => process.stdout.write(`\r🔄 Prepare download (${state.split(' ')[0]})`))
                .catch(error => {/* ignore errors here */});
        }, 1000);
        await page.waitForResponse(
            r => r.url().startsWith('https://my.fileee.com/api/v1/zip/download/'),
            {timeout: 30 * 60 * 1000}
        );
        clearInterval(interval);

        this.logJobStart('⬇️', 'Download archive');
        let filePath = null;
        for(const start = new Date().getTime(); new Date().getTime() - start < 30 * 60 * 1000; ) {
            const files = await readdir(tmpDir);
            const zipFileName = files.find(file => file.endsWith('.zip'));
            if(zipFileName) {
                filePath = path.join(tmpDir, zipFileName);
                break;
            }

            await page.waitForTimeout(1000);
        }

        this.logJobStart('✋🏼', 'Close browser');
        await browser.close();

        this.logJobStart('⏩', 'Move file to destination');
        await rename(filePath, destination);
        this.logJobEnd();
        console.log('\n🎉 Completed');
        console.log(`   Backup path: ${destination}`);
    }

    static logJobStart(emoji, name) {
        if(this.logJobStart.current) {
            this.logJobEnd();
        }

        this.logJobStart.current = [name, new Date().getTime()];
        process.stdout.write(`${emoji} ${name}`);
    }

    static logJobEnd() {
        if(!this.logJobStart.current) {
            return;
        }

        const [name, started] = this.logJobStart.current;
        const duration = new Date().getTime() - started;

        this.logJobStart.current = null;
        let durationTxt = '';

        if(duration >= 94000) {
            durationTxt = ` [${Math.floor(duration / 1000 / 60)}:${Math.ceil((duration / 1000) % 60).toString().padStart(2, '0')}]`;
        }
        else if(duration > 1000) {
            durationTxt = ` [${Math.ceil(duration / 1000)}s]`;
        }
        else if(duration > 50) {
            durationTxt = ` [${duration}ms]`;
        }

        readline.clearLine(process.stdout);
        readline.cursorTo(process.stdout, 0);
        console.log(`✅  ${name}${durationTxt}`);
    }
}

module.exports = FileeeBackupDownloader;
