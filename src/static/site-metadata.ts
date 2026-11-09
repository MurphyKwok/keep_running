interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const data: ISiteMetadataResult = {
  siteTitle: 'MurphyKwok 的跑步数据',
  siteUrl: 'https://murphykwok.github.io/keep_running/',
  logo: 'https://github.com/MurphyKwok.png',
  description: 'MurphyKwok 的个人跑步数据归档与可视化',
  navLinks: [
    {
      name: 'Blog',
      url: 'https://github.com/MurphyKwok',
    },
    {
      name: 'About',
      url: 'https://github.com/MurphyKwok/keep_running',
    },
  ],
};

export default data;
