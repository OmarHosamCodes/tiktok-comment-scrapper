import { Comment, type CommentData } from "./comment";

export interface CommentsData {
  caption: string;
  video_url: string;
  comments: CommentData[];
  has_more: number;
}

export class Comments {
  private _caption: string;
  private _video_url: string;
  private _comments: Comment[];
  private _has_more: number;

  constructor(
    caption: string,
    video_url: string,
    comments: Comment[],
    has_more: number
  ) {
    this._caption = caption;
    this._video_url = video_url;
    this._comments = comments;
    this._has_more = has_more;
  }

  get caption(): string {
    return this._caption;
  }

  get video_url(): string {
    return this._video_url;
  }

  get comments(): Comment[] {
    return this._comments;
  }

  get has_more(): number {
    return this._has_more;
  }

  get dict(): CommentsData {
    return {
      caption: this._caption,
      video_url: this._video_url,
      comments: this._comments.map((comment) => comment.dict),
      has_more: this._has_more,
    };
  }

  get json(): string {
    return JSON.stringify(this.dict);
  }

  toString(): string {
    return this.json;
  }
}
