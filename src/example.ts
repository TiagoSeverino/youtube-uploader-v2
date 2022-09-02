/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-console */

import uploadYoutube from '.';

const cookies = require('../cookies.json');

uploadYoutube(
	{
		path: 'test.mp4',
		title: 'Test upload',
		tags: ['test', 'upload'],
		description: 'Test description',
	},
	cookies
)
	.then((id) => {
		if (!id) return console.log('Failed to upload youtube');

		console.log(`Uploaded youtube, id: ${id}`);
	})
	.catch(console.error);
