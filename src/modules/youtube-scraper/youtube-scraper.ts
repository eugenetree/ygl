class YoutubeScraper {
  async getSearchResults(query: string) {
    let initdata = {};
    let apiToken = "";
    let context = {};

    const youtubeEndpoint = `https://www.youtube.com`;
    const endpoint =
      await `${youtubeEndpoint}/results?search_query=${query}&sp=EgIQAQ%3D%3D`;

    const page = await fetch(endpoint).then((res) => res.text());
    const ytInitData = await page.split("var ytInitialData =");

    if (ytInitData && ytInitData.length > 1) {
      const data = await ytInitData[1].split("</script>")[0].slice(0, -1);

      if (page.split("innertubeApiKey").length > 0) {
        apiToken = await page
          .split("innertubeApiKey")[1]
          .trim()
          .split(",")[0]
          .split('"')[2];
      }

      if (page.split("INNERTUBE_CONTEXT").length > 0) {
        context = await JSON.parse(
          page.split("INNERTUBE_CONTEXT")[1].trim().slice(2, -2)
        );
      }

      initdata = await JSON.parse(data);
      return await Promise.resolve({ initdata, apiToken, context });
      // return page;
    }
  }
}

export const youtubeScraper = new YoutubeScraper();
