import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Comment, Comments } from "../types";
import { logger } from "../utils";

interface RawCommentData {
  cid: string;
  user: {
    unique_id: string;
    nickname: string;
    avatar_thumb: {
      url_list: string[];
    };
  };
  text: string;
  create_time: number;
  reply_comment_total: number;
}

interface CommentListResponse {
  comments: (RawCommentData & {
    share_info: {
      title: string;
      url: string;
    };
  })[];
  has_more: number;
  status_code?: number;
}

export class TiktokComment {
  private static readonly BASE_URL = "https://www.tiktok.com";
  private static readonly API_URL = `${TiktokComment.BASE_URL}/api`;

  private id: string = "";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private parseComment(data: RawCommentData, replies: Comment[] = []): Comment {
    const parsedData = {
      comment_id: data.cid,
      username: data.user.unique_id,
      nickname: data.user.nickname,
      comment: data.text,
      create_time: data.create_time,
      avatar: data.user.avatar_thumb?.url_list?.[0] ?? "",
      total_reply: data.reply_comment_total,
    };

    const comment = new Comment(
      parsedData.comment_id,
      parsedData.username,
      parsedData.nickname,
      parsedData.comment,
      parsedData.create_time,
      parsedData.avatar,
      parsedData.total_reply,
      replies
    );

    logger.info(
      `${comment.create_time} - ${comment.username} : ${comment.comment}`
    );

    return comment;
  }

  private async initBrowser(): Promise<void> {
    if (this.browser) return;

    logger.info("Launching browser...");
    this.browser = await chromium.launch({
      headless: true,
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
    });

    this.page = await this.context.newPage();

    // Navigate to TikTok to get cookies and session
    logger.info("Initializing TikTok session...");
    await this.page.goto(TiktokComment.BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait a bit for cookies to be set
    await this.page.waitForTimeout(2000);
    logger.info("Browser initialized successfully");
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  private async fetchWithBrowser(url: string): Promise<unknown> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    // Use page.evaluate to make the fetch request from within the browser context
    // This ensures all cookies and session tokens are included
    const response = await this.page.evaluate(async (fetchUrl: string) => {
      const res = await fetch(fetchUrl, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      return res.json();
    }, url);

    return response;
  }

  private async *getAllReplies(comment_id: string): AsyncGenerator<Comment> {
    let page = 1;
    while (true) {
      const replies = await this.getReplies(comment_id, 50, page);
      if (!replies || replies.length === 0) break;
      for (const reply of replies) {
        yield reply;
      }
      page++;
    }
  }

  private async getReplies(
    comment_id: string,
    size: number = 50,
    page: number = 1
  ): Promise<Comment[]> {
    const url = new URL(`${TiktokComment.API_URL}/comment/list/reply/`);
    url.searchParams.set("aid", "1988");
    url.searchParams.set("comment_id", comment_id);
    url.searchParams.set("item_id", this.id);
    url.searchParams.set("count", size.toString());
    url.searchParams.set("cursor", ((page - 1) * size).toString());

    try {
      const json = (await this.fetchWithBrowser(url.toString())) as {
        comments?: RawCommentData[];
        status_code?: number;
      };

      if (json.status_code && json.status_code !== 0) {
        logger.warn(`Reply API returned status_code: ${json.status_code}`);
        return [];
      }

      if (!json.comments) return [];

      const comments: Comment[] = [];
      for (const commentData of json.comments) {
        comments.push(this.parseComment(commentData));
      }
      return comments;
    } catch (error) {
      logger.error(`Error fetching replies: ${error}`);
      return [];
    }
  }

  async getAllComments(id: string): Promise<Comments> {
    let page = 1;
    const data = await this.getComments(id, 50, page);

    while (data.has_more) {
      page++;
      logger.info(`Fetching page ${page}...`);
      const comments = await this.getComments(id, 50, page);
      if (!comments.has_more && comments.comments.length === 0) break;
      data.comments.push(...comments.comments);
      if (!comments.has_more) break;
    }

    return data;
  }

  async getComments(
    id: string,
    size: number = 50,
    page: number = 1
  ): Promise<Comments> {
    this.id = id;

    const url = new URL(`${TiktokComment.API_URL}/comment/list/`);
    url.searchParams.set("aid", "1988");
    url.searchParams.set("aweme_id", id);
    url.searchParams.set("count", size.toString());
    url.searchParams.set("cursor", ((page - 1) * size).toString());

    try {
      const json = (await this.fetchWithBrowser(
        url.toString()
      )) as CommentListResponse;

      if (json.status_code && json.status_code !== 0) {
        logger.warn(`API returned status_code: ${json.status_code}`);
        return new Comments("", "", [], 0);
      }

      const caption = json.comments?.[0]?.share_info?.title ?? "";
      const video_url = json.comments?.[0]?.share_info?.url ?? "";
      const has_more = json.has_more ?? 0;

      const comments: Comment[] = [];
      for (const commentData of json.comments ?? []) {
        const replies: Comment[] = [];
        if (commentData.reply_comment_total > 0) {
          logger.info(
            `Fetching ${commentData.reply_comment_total} replies for comment ${commentData.cid}...`
          );
          for await (const reply of this.getAllReplies(commentData.cid)) {
            replies.push(reply);
          }
        }
        comments.push(this.parseComment(commentData, replies));
      }

      return new Comments(caption, video_url, comments, has_more);
    } catch (error) {
      logger.error(`Error fetching comments: ${error}`);
      return new Comments("", "", [], 0);
    }
  }

  async scrape(id: string): Promise<Comments> {
    try {
      await this.initBrowser();
      const result = await this.getAllComments(id);
      return result;
    } finally {
      await this.closeBrowser();
    }
  }
}
