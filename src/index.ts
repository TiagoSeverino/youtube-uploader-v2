import { ElementHandle, Page, Protocol } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
	invalidTitleCharacters,
	runWithExceptionAsync,
	sleep,
	xpathTextSelector,
} from './utils';

puppeteer.use(StealthPlugin());

const url = {
	upload: 'https://www.youtube.com/upload',
	home: 'https://www.youtube.com',
	switch: 'https://www.youtube.com/channel_switcher',
};

interface VideoDetail {
	path: string;
	thumbnail?: string;
	title: string;
	description?: string;
	tags?: string[];
	channelName?: string;
}

const maxTitleLen = 100;
const maxDescLen = 5000;

const getBrowser = async (cookies: Protocol.Network.CookieParam[] = []) => {
	const browser = await puppeteer.launch({
		headless: false,
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-gpu',
			'--hide-scrollbars',
			'--disable-web-security',
		],
	});

	const page = await browser.newPage();

	await page.setDefaultNavigationTimeout(0);

	await Promise.all(
		cookies.map(async (cookie) => {
			try {
				await page.setCookie(cookie);
			} catch {}
		})
	);

	await page.setCookie();

	await page.setViewport({
		width: 1920,
		height: 1080,
	});

	return {
		browser,
		page,
	};
};

export default async (
	videoDetail: VideoDetail,
	cookies: Protocol.Network.CookieParam[] = []
): Promise<string | null> => {
	invalidTitleCharacters.map((c) => {
		if (videoDetail.title.includes(c))
			throw new Error(`Invalid title character: ${c}`);
	});

	const { browser, page } = await getBrowser(cookies);

	try {
		await page.evaluate(() => {
			window.onbeforeunload = null;
		});

		await changeLanguage(page);

		videoDetail.channelName &&
			(await changeChannel(page, videoDetail.channelName));

		return await uploadVideo(page, videoDetail);
	} finally {
		await browser.close();
	}
};

const uploadVideo = async (
	page: Page,
	{ path, thumbnail, title, description, tags }: VideoDetail
) => {
	await page.goto(url.upload, {
		waitUntil: 'networkidle2',
	});

	const closeBtnXPath = "//*[normalize-space(text())='Close']";
	const selectBtnXPath = "//*[normalize-space(text())='Select files']";
	const saveCloseBtnXPath =
		'//*[@aria-label="Save and close"]/tp-yt-iron-icon';
	const createBtnXPath = '//*[@id="create-icon"]/tp-yt-iron-icon';
	const addVideoBtnXPath =
		'//*[@id="text-item-0"]/ytcp-ve/div/div/yt-formatted-string';
	if (await page.waitForXPath(createBtnXPath).catch(() => null)) {
		const createBtn = (await page.$x(
			createBtnXPath
		)) as ElementHandle<Element>[];
		await createBtn[0].click();
	}
	if (await page.waitForXPath(addVideoBtnXPath).catch(() => null)) {
		const addVideoBtn = (await page.$x(
			addVideoBtnXPath
		)) as ElementHandle<Element>[];
		await addVideoBtn[0].click();
	}
	for (let i = 0; i < 2; i += 1) {
		try {
			await page.waitForXPath(selectBtnXPath);
			await page.waitForXPath(closeBtnXPath);
			break;
		} catch (error) {
			await page.evaluate(() => {
				window.onbeforeunload = null;
			});
			await page.goto(url.upload);
		}
	}
	// Remove hidden closebtn text
	const closeBtn = await page.$x(closeBtnXPath);
	await page.evaluate((el) => {
		el.textContent = 'oldclosse';
	}, closeBtn[0]);

	const selectBtn = (await page.$x(
		selectBtnXPath
	)) as ElementHandle<Element>[];
	const [fileChooser] = await Promise.all([
		page.waitForFileChooser(),
		selectBtn[0].click(),
	]);
	await fileChooser.accept([path]);

	await sleep(5000);

	const errorMessage = await page.evaluate(() =>
		(document.querySelector(
			'.error-area.style-scope.ytcp-uploads-dialog'
		) as HTMLElement)?.innerText.trim()
	);

	if (errorMessage && errorMessage.length > 0)
		throw new Error(`Youtube returned an error : ${errorMessage}`);

	// Wait for upload to go away and processing to start
	await page.waitForXPath('//*[contains(text(),"Upload complete")]', {
		hidden: true,
		timeout: 0,
	});

	await sleep(5000);

	await page.waitForFunction(
		'document.querySelectorAll(\'[id="textbox"]\').length > 1'
	);
	const textBoxes = await page.$x('//*[@id="textbox"]');
	await page.bringToFront();
	// Add the title value
	await textBoxes[0].focus();
	await page.waitForTimeout(1000);
	await textBoxes[0].type(title.substring(0, maxTitleLen));
	// Add the Description content
	description &&
		(await textBoxes[1].type(description.substring(0, maxDescLen)));

	const childOption = (await page.$x(
		'//*[contains(text(),"No, it\'s")]'
	)) as ElementHandle<Element>[];
	await childOption[0].click();

	const moreOption = (await page.$x(
		"//*[normalize-space(text())='Show more']"
	)) as ElementHandle<Element>[];
	await moreOption[0].click();
	// Wait until title & description box pops up
	if (thumbnail) {
		const thumbnailChooserXpath = xpathTextSelector('upload thumbnail');
		await page.waitForXPath(thumbnailChooserXpath);
		const thumbBtn = (await page.$x(
			thumbnailChooserXpath
		)) as ElementHandle<Element>[];
		const [thumbChooser] = await Promise.all([
			page.waitForFileChooser(),
			thumbBtn[0].click(), // button that triggers file selection
		]);
		await thumbChooser.accept([thumbnail]);
	}

	if (tags && tags.length > 0) {
		await page.focus(`[aria-label="Tags"]`);
		await page.type(
			`[aria-label="Tags"]`,
			`${tags.join(', ').substring(0, 495)}, `
		);
	}

	// click next button
	const nextBtnXPath =
		"//*[normalize-space(text())='Next']/parent::*[not(@disabled)]";
	await page.waitForXPath(nextBtnXPath);
	let next = (await page.$x(nextBtnXPath)) as ElementHandle<Element>[];
	await next[0].click();
	// await sleep(2000)
	await page.waitForXPath(nextBtnXPath);
	// click next button
	next = (await page.$x(nextBtnXPath)) as ElementHandle<Element>[];
	await next[0].click();

	await page.waitForXPath(nextBtnXPath);
	// click next button
	next = (await page.$x(nextBtnXPath)) as ElementHandle<Element>[];
	await next[0].click();
	//  const publicXPath = `//*[normalize-space(text())='Public']`
	//  await page.waitForXPath(publicXPath)
	//  const publicOption = await page.$x(publicXPath)
	//  await publicOption[0].click()

	// Get publish button
	const publishXPath =
		"//*[normalize-space(text())='Publish']/parent::*[not(@disabled)] | //*[normalize-space(text())='Save']/parent::*[not(@disabled)]";
	await page.waitForXPath(publishXPath);
	// save youtube upload link
	const videoBaseLink = 'https://youtu.be';
	const shortVideoBaseLink = 'https://youtube.com/shorts';
	const uploadLinkSelector = `[href^="${videoBaseLink}"], [href^="${shortVideoBaseLink}"]`;
	await page.waitForSelector(uploadLinkSelector);
	const uploadedLinkHandle = await page.$(uploadLinkSelector);

	let uploadedLink;
	do {
		await page.waitForTimeout(500);
		uploadedLink = await page.evaluate(
			(e) => e && e.getAttribute('href'),
			uploadedLinkHandle
		);
	} while (
		uploadedLink === videoBaseLink ||
		uploadedLink === shortVideoBaseLink
	);

	const closeDialogXPath = publishXPath;
	let closeDialog;
	for (let i = 0; i < 10; i++) {
		try {
			closeDialog = (await page.$x(
				closeDialogXPath
			)) as ElementHandle<Element>[];
			await closeDialog[0].click();
			break;
		} catch (error) {
			await page.waitForTimeout(5000);
		}
	}

	// Wait for closebtn to show up
	await runWithExceptionAsync(
		async () => page.waitForXPath(closeBtnXPath),
		'Please make sure you set up your default video visibility correctly, you might have forgotten. '
	);

	return uploadedLink;
};

const changeChannel = async (page: Page, channelName: string) => {
	await page.goto(url.switch);

	const channelNameXPath = `//*[normalize-space(text())='${channelName}']`;
	const element = (await page.waitForXPath(
		channelNameXPath
	)) as ElementHandle<Element> | null;

	if (!element) throw new Error(`Channel ${channelName} not found`);

	await element.click();

	await page.waitForNavigation({
		waitUntil: 'networkidle0',
	});
};

const changeLanguage = async (page: Page) => {
	await page.goto(url.home);

	const avatarButtonSelector = 'button#avatar-btn';

	await runWithExceptionAsync(
		() => page.waitForSelector(avatarButtonSelector),
		`Avatar/Profile picture button not found`
	);

	await page.click(avatarButtonSelector);

	const langMenuItemSelector =
		'#sections>yt-multi-page-menu-section-renderer:nth-child(3)>#items>ytd-compact-link-renderer>a';

	await runWithExceptionAsync(
		() => page.waitForSelector(langMenuItemSelector),
		`Language menu item selector/button(">") not found`
	);

	const selectedLang = await page.evaluate(
		(langMenuItemSelectorInternal) =>
			(document.querySelector(
				langMenuItemSelectorInternal
			) as HTMLElement).innerText,
		langMenuItemSelector
	);

	if (!selectedLang)
		throw new Error('Failed to find selected language : Empty text');

	if (selectedLang.includes('English')) return;

	await page.click(langMenuItemSelector);

	const englishItemXPath = "//*[normalize-space(text())='English (UK)']";

	await runWithExceptionAsync(
		() => page.waitForXPath(englishItemXPath),
		`English(UK) item selector not found`
	);

	await sleep(3000);

	await page.evaluate((englishItemXPathInternal) => {
		const element: HTMLElement = document?.evaluate(
			englishItemXPathInternal,
			document,
			null,
			XPathResult.FIRST_ORDERED_NODE_TYPE,
			null
		).singleNodeValue as HTMLElement;
		element.click();
	}, englishItemXPath);
	// Recursive language change, if YouTube, for some reason, did not change the language the first time, although the English (UK) button was pressed, the exit from the recursion occurs when the selectedLang selector is tested for the set language
	await changeLanguage(page);
};
