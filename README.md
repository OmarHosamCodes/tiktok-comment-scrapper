[![Twitter: romy](https://img.shields.io/twitter/follow/RomySihananda)](https://twitter.com/RomySihananda)

# tiktok-comment-scrapper

![](https://raw.githubusercontent.com/RomySaputraSihananda/RomySaputraSihananda/main/images/GA-U-u2bsAApmn9.jpeg)
Get all comments from TikTok video URL or ID

## Requirements

- **Bun >= 1.0**

## Installation

```sh
# Clone Repository
git clone https://github.com/romysaputrasihananda/tiktok-comment-scrapper

# Change Directory
cd tiktok-comment-scrapper

# Install Dependencies
bun install
```

## Example Usages

```sh
bun start --id=7170139292767882522 --output=data
```

Or using the dev mode (with watch):

```sh
bun run dev -- --id=7170139292767882522 --output=data
```

### Flags

| Flag       | Description                     | Example                           | Default |
| :--------- | :------------------------------ | :-------------------------------- | :-----: |
| --id | TikTok video ID (required)      | --id=7170139292767882522    |    -    |
| --output   | Directory for JSON output       | --output=data                     |  data/  |
| --version  | Show version                    | --version                         |    -    |
| --help     | Show help                       | --help                            |    -    |

## Building

```sh
# Build for production
bun run build

# Type check
bun run typecheck
```

## Sample Output

![](https://raw.githubusercontent.com/RomySaputraSihananda/RomySaputraSihananda/main/images/Screenshot_20231211_001804.png)

```json
{
  "caption": "makk aku jadi animee🤩#faceplay #faceplayapp #anime #harem #xysryo ",
  "video_url": "https://t.tiktok.com/i18n/share/video/7170139292767882522/?_d=0&comment_author_id=6838487455625479169&mid=7157599449395496962&preview_pb=0&region=ID&share_comment_id=7310977412674093829&share_item_id=7170139292767882522&sharer_language=en&source=h5_t&u_code=0",
  "comments": [
    {
      "comment_id": "7310977412674093829",
      "username": "user760722966",
      "nickname": "rehan",
      "comment": "testing 😁😁",
      "create_time": "2023-12-10T21:46:36",
      "avatar": "https://p16-sign-useast2a.tiktokcdn.com/tos-useast2a-avt-0068-giso/f64f2c7df8a16098d3b3c80e958ffc52~c5_100x100.jpg",
      "total_reply": 0,
      "replies": []
    },
    {
      "comment_id": "7310977412674093830",
      "username": "user760722966",
      "nickname": "rehan",
      "comment": "bagus",
      "create_time": "2023-12-10T18:55:47",
      "avatar": "https://p16-sign-useast2a.tiktokcdn.com/tos-useast2a-avt-0068-giso/f64f2c7df8a16098d3b3c80e958ffc52~c5_100x100.jpg",
      "total_reply": 3,
      "replies": [
        {
          "comment_id": "7310977412674093831",
          "username": "ryo.syntax",
          "nickname": "Bukan Rio",
          "comment": "good game",
          "create_time": "2023-12-10T18:56:19",
          "avatar": "https://p16-sign-useast2a.tiktokcdn.com/tos-useast2a-avt-0068-giso/be4a9d0479f29d00cb3d06905ff5a972~c5_100x100.jpg",
          "total_reply": 0,
          "replies": []
        }
      ]
    }
  ],
  "has_more": 0
}
```

## Project Structure

```
src/
├── index.ts           # CLI entry point
├── scraper/
│   ├── index.ts       # Scraper exports
│   └── tiktok-comment.ts  # Main scraper class
├── types/
│   ├── index.ts       # Type exports
│   ├── comment.ts     # Comment type/class
│   └── comments.ts    # Comments collection type/class
└── utils/
    ├── index.ts       # Utils exports
    └── logger.ts      # Colored logger utility
```

## License

This project is licensed under the [MIT License](LICENSE).
