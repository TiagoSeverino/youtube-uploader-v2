export async function sleep(ms: number): Promise<unknown> {
	return new Promise((sendMessage) => setTimeout(sendMessage, ms));
}

export const invalidTitleCharacters = ['<', '>'];

export async function runWithExceptionAsync<T>(
	code: () => Promise<T>,
	message: string
): Promise<T> {
	try {
		return await code();
	} catch (e) {
		throw new Error(message);
	}
}

export async function runWithExceptionSync<T>(
	code: () => T,
	message: string
): Promise<T> {
	try {
		return code();
	} catch (e) {
		throw new Error(message);
	}
}

export const xpathTextSelector = (
	text: string,
	caseSensitive?: boolean,
	nthElement?: number
): string => {
	let xpathSelector = '';
	if (caseSensitive)
		xpathSelector = `//*[contains(normalize-space(text()),"${text}")]`;
	else {
		const uniqueText = [...new Set(text.split(''))].join('');
		xpathSelector = `//*[contains(translate(normalize-space(text()),'${uniqueText.toUpperCase()}','${uniqueText.toLowerCase()}'),"${text
			.toLowerCase()
			.replace(/\s\s+/g, ' ')}")]`;
	}
	if (nthElement) xpathSelector = `(${xpathSelector})[${nthElement + 1}]`;

	return xpathSelector;
};
