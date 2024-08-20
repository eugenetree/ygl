const words = require('./words_dictionary.json');
const fs = require('fs');
const searchApi = require("youtube-search-api");

const main = async () => {
  const scrappedData = {};
  let count = 0;

  // for (const word in words) {
  //   console.log('processing word:', word);

  //   if (word.length < 3) {
  //     continue;
  //   }

  // await searchApi.GetListByKeyword("dota 2").then((result) => {
  //   // console.log(JSON.stringify(result, null, 2));
  //   fs.writeFileSync('dota2.json', JSON.stringify(result, null, 2));
  // })

  // await searchApi.GetVideoDetails("YHxj3LvZoLQ").then((result) => {
  //   console.log(JSON.stringify(result, null, 2));
  // })

  // await searchApi.GetChannelById("UCj7bSQWlq2O4lhGxGll5SUA").then((result) => {
  // console.log(JSON.stringify(result, null, 2));
  // fs.writeFileSync('channel.json', JSON.stringify(result, null, 2));
  // })

  // return;
  // }

  // searchApi.GetVideoDetails("alDTkiCC738")
  // .then((result) => {
  //   console.log(JSON.stringify(result, null, 2));
  // });

  // fetch('https://www.youtube.com/@AlexShevstsov')
  //   .then(res => res.text())
  //   .then((html) => {
  //     const pattern = /<script[^>]*>\s*var\s+ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s;
  //     const match = html.match(pattern);

  //     if (match) {
  //       const json = match[1];
  //       fs.writeFileSync('shevcov.json', json);
  //     }
  //   });
}

main();