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
}

export class TiktokComment {
  private static readonly BASE_URL = "https://www.tiktok.com";
  private static readonly API_URL = `${TiktokComment.BASE_URL}/api`;

  private id: string = "";

  private parseComment(data: RawCommentData, replies: Comment[] = []): Comment {
    const parsedData = {
      comment_id: data.cid,
      username: data.user.unique_id,
      nickname: data.user.nickname,
      comment: data.text,
      create_time: data.create_time,
      avatar: data.user.avatar_thumb.url_list[0],
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

    const response = await fetch(url.toString());
    const json = (await response.json()) as { comments?: RawCommentData[] };

    if (!json.comments) return [];

    const comments: Comment[] = [];
    for (const commentData of json.comments) {
      comments.push(this.parseComment(commentData));
    }
    return comments;
  }

  async getAllComments(id: string): Promise<Comments> {
    let page = 1;
    const data = await this.getComments(id, 50, page);

    while (true) {
      page++;
      const comments = await this.getComments(id, 50, page);
      if (!comments.has_more) break;
      data.comments.push(...comments.comments);
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
    url.searchParams.set("id", id);
    url.searchParams.set("count", size.toString());
    url.searchParams.set("cursor", ((page - 1) * size).toString());

    const response = await fetch(url.toString());
    const json = (await response.json()) as CommentListResponse;

    const caption = json.comments?.[0]?.share_info?.title ?? "";
    const video_url = json.comments?.[0]?.share_info?.url ?? "";
    const has_more = json.has_more ?? 0;

    const comments: Comment[] = [];
    for (const commentData of json.comments ?? []) {
      const replies: Comment[] = [];
      if (commentData.reply_comment_total > 0) {
        for await (const reply of this.getAllReplies(commentData.cid)) {
          replies.push(reply);
        }
      }
      comments.push(this.parseComment(commentData, replies));
    }

    return new Comments(caption, video_url, comments, has_more);
  }

  async scrape(id: string): Promise<Comments> {
    return this.getAllComments(id);
  }
}
