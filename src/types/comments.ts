import type { Comment, CommentData } from "./comment";

export interface CommentsData {
	caption: string;
	video_url: string;
	comments: CommentData[];
	has_more: number;
	needs_auth?: boolean;
	auth_message?: string;
}

export class Comments {
	private _caption: string;
	private _video_url: string;
	private _comments: Comment[];
	private _has_more: number;
	private _needs_auth: boolean;
	private _auth_message: string;

	constructor(
		caption: string,
		video_url: string,
		comments: Comment[],
		has_more: number,
		needs_auth: boolean = false,
		auth_message: string = "",
	) {
		this._caption = caption;
		this._video_url = video_url;
		this._comments = comments;
		this._has_more = has_more;
		this._needs_auth = needs_auth;
		this._auth_message = auth_message;
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

	get needs_auth(): boolean {
		return this._needs_auth;
	}

	get auth_message(): string {
		return this._auth_message;
	}

	get dict(): CommentsData {
		return {
			caption: this._caption,
			video_url: this._video_url,
			comments: this._comments.map((comment) => comment.dict),
			has_more: this._has_more,
			needs_auth: this._needs_auth || undefined,
			auth_message: this._auth_message || undefined,
		};
	}

	get json(): string {
		return JSON.stringify(this.dict);
	}

	toString(): string {
		return this.json;
	}
}
