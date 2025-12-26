export interface CommentData {
	comment_id: string;
	username: string;
	nickname: string;
	comment: string;
	create_time: string;
	avatar: string;
	total_reply: number;
	replies: CommentData[];
	parent_comment_id?: string; // For replies, tracks which comment this is replying to
	is_orphan_reply?: boolean; // True if parent comment was not found
}

export class Comment {
	private _comment_id: string;
	private _username: string;
	private _nickname: string;
	private _comment: string;
	private _create_time: string;
	private _avatar: string;
	private _total_reply: number;
	private _replies: Comment[];
	private _parent_comment_id?: string;
	private _is_orphan_reply: boolean;

	constructor(
		comment_id: string,
		username: string,
		nickname: string,
		comment: string,
		create_time: number,
		avatar: string,
		total_reply: number,
		replies: Comment[] = [],
		parent_comment_id?: string,
		is_orphan_reply = false,
	) {
		this._comment_id = comment_id;
		this._username = username;
		this._nickname = nickname;
		this._comment = comment;
		this._create_time = new Date(create_time * 1000).toISOString().slice(0, 19);
		this._avatar = avatar;
		this._total_reply = total_reply;
		this._replies = replies;
		this._parent_comment_id = parent_comment_id;
		this._is_orphan_reply = is_orphan_reply;
	}

	get comment_id(): string {
		return this._comment_id;
	}

	get username(): string {
		return this._username;
	}

	get nickname(): string {
		return this._nickname;
	}

	get comment(): string {
		return this._comment;
	}

	get create_time(): string {
		return this._create_time;
	}

	get avatar(): string {
		return this._avatar;
	}

	get total_reply(): number {
		return this._total_reply;
	}

	get replies(): Comment[] {
		return this._replies;
	}

	get parent_comment_id(): string | undefined {
		return this._parent_comment_id;
	}

	get is_orphan_reply(): boolean {
		return this._is_orphan_reply;
	}

	get dict(): CommentData {
		return {
			comment_id: this._comment_id,
			username: this._username,
			nickname: this._nickname,
			comment: this._comment,
			create_time: this._create_time,
			avatar: this._avatar,
			total_reply: this._total_reply,
			replies: this._replies.map((reply) => reply.dict),
			parent_comment_id: this._parent_comment_id,
			is_orphan_reply: this._is_orphan_reply,
		};
	}

	get json(): string {
		return JSON.stringify(this.dict);
	}

	toString(): string {
		return this.json;
	}
}
