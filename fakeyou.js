"use strict";

const { randomUUID } = require("crypto");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { fakeYouToken } = 'SAPI:FTK789_6096133E1D79D6FB'

/*
  Name: fetchPatiently(String url, Object params): Object
  Description: Wrapper for node-fetch which retries upon 408 and 502 error codes
  Returns: HTTP response
*/
async function fetchPatiently(url, params) {

	let response = await fetch(url, params);

	while (response.status === 408 || response.status === 502) {
		// Wait three seconds between each new request
		await new Promise(res => setTimeout(res, 3000));
		response = await fetch(url, params);
	}

	return response;
}

/*
  Name: poll(String token): String
  Description: Polls until a speech request is complete
  Returns: URL on success, error string on failure
*/
function poll(token) {
	console.log('polling')
	return new Promise(async(resolve, reject) => {

		// Wait one second between each poll request
		await new Promise(res => setTimeout(res, 1000));

		// Retrieve status of current speech request
		console.log('current state fetching...')
		const response = await fetchPatiently(`https://api.fakeyou.com/tts/job/${token}`, {
			method: "GET",
			headers: {
				"Authorization": fakeYouToken,
				"Accept": "application/json"
			}
		}).catch(error => {
			reject(`HTTP error! ${error.name}`);
			console.error(error);
		});
		if (!response.ok) return;
		
		const json = await response.json().catch(error => {
			reject("Failed to parse poll JSON!");
			console.error(error);
		});
		if (!json) return;
	

		if (!json.success) {
			reject(`Failed polling! ${json.error_reason}`);
			console.error(json);
			return;
		}

		switch (json.state.status) {
			case "pending": {
				console.log('pending...')
			}
			case "started":{
				console.log('started...')
			}
			case "attempt_failed": {
				console.log('not done')
				// Continue polling until success
				await poll(token).then(resolve).catch(reject);
				return;
			}
			case "complete_success": {
				console.log('done')
				// Success, return audio URL
				console.log('link ready')
				resolve(`https://storage.googleapis.com/vocodes-public${json.state.maybe_public_bucket_wav_audio_path}`);
				return;
			}
			case "complete_failure":{
				console.log('failed permenantly')
			}
			case "dead":{
				console.log('dead now')
			}
			default: {
				console.log('failed')
				// Failure, stop polling
				reject(`Failed polling! ${json.state.status}`);
				console.error(json);
				return;
			}
		}
	});
}

/*
  Name: requestSpeech(String voice, String message): String
  Description: Requests speech and polls until job is complete
  Returns: URL on success, error string on failure
*/
module.exports.requestSpeech = (voice, message) => {
	console.log('requesting...')
	return new Promise(async(resolve, reject) => {

		// Request generation of speech
		const response = await fetchPatiently("https://api.fakeyou.com/tts/inference", {
			method: "POST",
			body: JSON.stringify({
				tts_model_token: voice,
				uuid_idempotency_token: randomUUID(),
				inference_text: message
			}),
			headers: {
				"Authorization": fakeYouToken,
				"Accept": "application/json",
				"Content-Type": "application/json"
			}
		}).catch(error => {
			reject(`HTTP error! ${error.name}`);
			console.error(error);
		});
		if (!response.ok) return;

		const json = await response.json().catch(error => {
			reject("Failed to parse request JSON!");
			console.error(error);
		});
		if (!json) return;

		if (!json.success) {
			reject(`Failed voice request! ${json.error_reason}`);
			console.error(json);
			return;
		}
console.log('poll fetching for final token')
		// Poll until request has been fulfilled
		await poll(json.inference_job_token).then(resolve).catch(reject);
console.log('done')
	});
};
