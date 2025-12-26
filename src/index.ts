#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { program } from "commander";
import { TiktokComment } from "./scraper";
import { logger } from "./utils";

const title = "TikTok Comment Scrapper";
const version = "2.0.0";

program
	.name("tiktok-comment-scrapper")
	.description(title)
	.version(version)
	.requiredOption("--id <id>", "TikTok video ID (e.g., 7418294751977327878)")
	.option("--output <dir>", "Output directory for data", "data/")
	.action(async (options: { id: string; output: string }) => {
		const { id, output } = options;

		// Validate id is numeric
		if (!/^\d+$/.test(id)) {
			console.error("Error: id must be numeric. Example: 7418294751977327878");
			process.exit(1);
		}

		logger.info(`Starting to scrape comments for ${id}`);

		const scraper = new TiktokComment();
		const comments = await scraper.scrape(id);

		// Normalize output path
		let outputDir = output.replace(/[/\\]+$/, "");
		if (outputDir === "") {
			outputDir = "data";
		}

		// Create directory if it doesn't exist
		if (!existsSync(outputDir)) {
			await mkdir(outputDir, { recursive: true });
		}

		// Write JSON file
		const finalPath = join(outputDir, `${id}.json`);
		await writeFile(finalPath, JSON.stringify(comments.dict, null, 4), "utf-8");

		logger.info(`Saved comments for ${id} to ${finalPath}`);
	});

program.parse();
