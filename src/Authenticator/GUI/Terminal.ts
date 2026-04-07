import prompt from 'prompt';

module.exports = async function (url: string) {
    console.log(`Open brosser ${url}`);
    prompt.start();
    let result = await prompt.get(['copy-URL']);
    return result['copy-URL'].split("code=")[1].split("&")[0];
}