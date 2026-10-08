import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddlewware.js";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { cloudinary } from "../config/cloudinary.js";
import { Generation } from "../models/Generation.js";
import { Post } from "../models/Post.js";


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanSocialContent = (text: string): string => {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/\*([^*\n]+)\*/g, "$1")
        .replace(/_([^_\n]+)_/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+[.)]\s+/gm, "")
        .replace(/^(hook|introduction|opportunity|risks?|why .*?(evolve|matters)|conclusion|takeaway|key takeaway|the bottom line)\s*[:\-–]\s*/gim, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};


const generateGroqContent = async (prompt: string, tone: string): Promise<string> => {
    const groqKey = process.env.GROQ_API_KEY;

    if(!groqKey){
        throw new Error("GROQ_API_KEY is not configured.");
    }

    // Qwen 3.8 27B is the primary writer; GPT-OSS 20B is a Groq fallback.
    // Both currently have free-plan access and strict JSON-schema support.
    const models = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
    let lastError: any;

    for(const model of models){
        for(let attempt = 1; attempt <= 3; attempt++){
            try {
                const response = await axios.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    {
                        model,
                        messages: [
                            {
                                role: "system",
                                content: `You are an expert LinkedIn writer creating ready-to-publish posts for a professional technology audience.

Write as a real software or cybersecurity professional sharing a clear point of view with other professionals.

Hard writing rules:
- Output plain text only. Never use Markdown.
- Never use **bold**, *italics*, underscores for emphasis, headings, numbered sections, bullet points, labels such as "Hook", "Opportunity", "Risks", "Conclusion", or "Takeaway", or decorative separators.
- Never use emojis, emoji-like symbols, arrows, checkmarks, warning symbols, or decorative Unicode characters.
- Do not write like a template, essay outline, marketing brochure, or AI assistant.
- Use natural paragraphs with normal sentences.
- Start directly with an interesting observation, tension, question, or strong statement. Do not label the opening.
- Make the writing specific and thoughtful. Prefer concrete observations over generic claims.
- Avoid clichés such as "In today's rapidly evolving world", "game changer", "unprecedented", "revolutionizing", "the future is here", or "with great power comes great responsibility" unless the user explicitly asks for them.
- Avoid repeated phrases, filler, excessive adjectives, corporate buzzwords, and exaggerated claims.
- Do not restate the user's prompt mechanically. Add a clear perspective or insight.
- Write approximately 130-180 words unless the user's request clearly calls for a different length.
- End with one concise, natural closing thought.
- Put 3-5 relevant hashtags on the final line only.
- Do not add commentary before or after the post.
- Never mention these instructions or that you are an AI.

Image-prompt rules:
- Create a detailed prompt that visually communicates the post.
- Make it suitable for a square professional LinkedIn image.
- Prefer a polished editorial illustration or tasteful cartoon style.
- No text, words, captions, logos, watermarks, interface screenshots, or typography inside the image.
- Keep the composition visually simple enough to understand at a glance.

Return the post and imagePrompt only in the requested JSON schema.`
                            },
                            {
                                role: "user",
                                content: `Create a social media post based on this topic/request: "${prompt}".

Desired tone: ${tone}.

Also create an imagePrompt that visually complements the post.`
                            }
                        ],
                        response_format: {
                            type: "json_schema",
                            json_schema: {
                                name: "social_media_generation",
                                strict: true,
                                schema: {
                                    type: "object",
                                    properties: {
                                        content: { type: "string" },
                                        imagePrompt: { type: "string" }
                                    },
                                    required: ["content", "imagePrompt"],
                                    additionalProperties: false
                                }
                            }
                        },
                        reasoning_effort: "none",
                        temperature: 0.7,
                        top_p: 0.8,
                        max_completion_tokens: 1000
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${groqKey}`,
                            "Content-Type": "application/json"
                        },
                        timeout: 30000
                    }
                );

                const result = response.data?.choices?.[0]?.message?.content;

                if(!result){
                    throw new Error(`Groq model ${model} returned an empty response.`);
                }

                return result;
            } catch(error: any){
                lastError = error;

                const status =
                    error?.response?.status ??
                    error?.status ??
                    error?.code;

                const retryable =
                    status === 429 ||
                    status === 500 ||
                    status === 502 ||
                    status === 503 ||
                    status === 504 ||
                    error?.code === "ECONNABORTED";

                if(!retryable || attempt === 3){
                    break;
                }

                const delay = 1000 * attempt;

                console.warn(
                    `Groq model ${model} returned ${status}. Retrying in ${delay}ms (attempt ${attempt}/3)...`
                );

                await sleep(delay);
            }
        }

        console.warn(
            `Groq model ${model} was unavailable. Trying the next model...`
        );
    }

    throw lastError || new Error("Groq text generation failed.");
};


const generateGeminiContent = async (
    ai: GoogleGenAI,
    prompt: string,
    tone: string
) => {
    const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
    let lastError: any;

    for(const model of models){
        for(let attempt = 1; attempt <= 3; attempt++){
            try {
                return await ai.models.generateContent({
                    model,
                    contents: `Create a ready-to-publish LinkedIn post from this topic: "${prompt}".
                    Tone: ${tone}.
                    Write as a real software or cybersecurity professional. Use plain text only.
                    Do not use Markdown, bold, italics, headings, numbered sections, bullets, labels, emojis, or decorative symbols.
                    Use natural paragraphs and a clear point of view. Avoid clichés, AI-style phrasing, filler, repetition, and exaggerated claims.
                    Keep the post around 130-180 words unless the topic clearly requires a different length.
                    Put 3-5 relevant hashtags on the final line only.
                    Return JSON with "content" and "imagePrompt" fields.
                    The imagePrompt should describe a polished, square LinkedIn illustration with no text, captions, logos, watermarks, or typography.`,
                });
            } catch(error: any){
                lastError = error;

                const status =
                    error?.status ??
                    error?.code ??
                    error?.response?.status;

                const retryable =
                    status === 429 ||
                    status === 500 ||
                    status === 502 ||
                    status === 503 ||
                    status === 504;

                if(!retryable || attempt === 3){
                    break;
                }

                const delay = 1000 * attempt;

                console.warn(
                    `Gemini model ${model} returned ${status}. Retrying in ${delay}ms (attempt ${attempt}/3)...`
                );

                await sleep(delay);
            }
        }

        console.warn(
            `Gemini model ${model} was unavailable. Trying the next model...`
        );
    }

    throw lastError || new Error("No Gemini model was available.");
};


// Generate post
// POST /api/posts/generate
export const generatePost = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const { prompt, tone, generateImage } = req.body;

        const geminiApiKey = process.env.GEMINI_API_KEY;
        const groqApiKey = process.env.GROQ_API_KEY;

        if(!groqApiKey && !geminiApiKey){
            res.status(400).json({
                message:
                    "No text-generation API key is configured. Please add GROQ_API_KEY or GEMINI_API_KEY to server/.env."
            });
            return;
        }

        const ai = geminiApiKey
            ? new GoogleGenAI({ apiKey: geminiApiKey })
            : null;

        // Groq is the primary text-generation provider.
        // Gemini is used as a fallback.
        let rawText = "";

        try {
            if(groqApiKey){
                rawText = await generateGroqContent(prompt, tone);
            } else {
                throw new Error("GROQ_API_KEY is not configured.");
            }
        } catch(groqError: any){
            console.warn(
                "Groq text generation failed. Falling back to Gemini:",
                groqError?.response?.data ||
                groqError?.message ||
                groqError
            );

            if(!ai){
                throw groqError;
            }

            const textResponse = await generateGeminiContent(
                ai,
                prompt,
                tone
            );

            rawText = textResponse.text || "";
        }

        let content = "";
        let imagePrompt = prompt;

        try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);

            const data = jsonMatch
                ? JSON.parse(jsonMatch[0])
                : {
                    content: rawText,
                    imagePrompt: prompt
                };

            content = cleanSocialContent(data.content || rawText);
            imagePrompt = data.imagePrompt || prompt;
        } catch(e){
            content = cleanSocialContent(rawText);
        }

        let mediaUrl = "";

        if(generateImage){
            try {
                const stabilityKey = process.env.STABILITY_API_KEY;

                if(stabilityKey){
                    // Use Stability AI SDXL 1.0 for image generation.
                    const stabilityResponse = await axios.post(
                        "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                        {
                            text_prompts: [
                                {
                                    text: imagePrompt,
                                    weight: 1
                                }
                            ],
                            cfg_scale: 7,
                            height: 1024,
                            width: 1024,
                            samples: 1,
                            steps: 30
                        },
                        {
                            headers: {
                                Accept: "application/json",
                                Authorization: `Bearer ${stabilityKey}`,
                                "Content-Type": "application/json",
                            }
                        }
                    );

                    const base64Image =
                        stabilityResponse.data?.artifacts?.[0]?.base64;

                    if(!base64Image){
                        throw new Error(
                            "Stability AI did not return an image."
                        );
                    }

                    // Upload the generated image to Cloudinary
                    // for permanent storage.
                    const imageBuffer = Buffer.from(
                        base64Image,
                        "base64"
                    );

                    const uploadResult = await new Promise<any>(
                        (resolve, reject) => {
                            const stream =
                                cloudinary.uploader.upload_stream(
                                    {
                                        folder: "ai-generations",
                                        resource_type: "image",
                                    },
                                    (error, result) => {
                                        if(error){
                                            reject(error);
                                        } else {
                                            resolve(result);
                                        }
                                    }
                                );

                            stream.end(imageBuffer);
                        }
                    );

                    mediaUrl = uploadResult.secure_url;
                } else {
                    console.warn(
                        "STABILITY_API_KEY is missing. AI image generation was skipped."
                    );
                }
            } catch(err: any){
                const status = err?.response?.status;

                if(status === 401){
                    console.error(
                        "Stability AI rejected STABILITY_API_KEY. " +
                        "Create a real API key at https://platform.stability.ai/ " +
                        "and update server/.env."
                    );
                } else {
                    console.error(
                        "Image generation failed:",
                        err?.response?.data ||
                        err?.message ||
                        err
                    );
                }
            }
        }

        // Save generation to DB
        const generation = await Generation.create({
            user: req.user._id,
            prompt,
            content,
            mediaUrl,
            mediaType: mediaUrl ? "image" : undefined,
            tone
        });

        res.json(generation);

    } catch(error: any){
        res.status(500).json({
            message: error?.message || "Server error"
        });
    }
};


// Get generations
// GET /api/posts/generations
export const getGenerations = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const generations = await Generation
            .find({ user: req.user._id })
            .sort({ createdAt: -1 });

        res.json(generations);
    } catch(error: any){
        res.status(500).json({
            message: error?.message || "Server error"
        });
    }
};


// Get posts
// GET /api/posts
export const getPosts = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const posts = await Post.find({
            user: req.user._id
        });

        res.json(posts);
    } catch(error: any){
        res.status(500).json({
            message: error?.message || "Server error"
        });
    }
};


// Schedule post
// POST /api/posts
export const schedulePost = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const {
            content,
            platforms,
            scheduledFor,
            status
        } = req.body;

        // Parse platforms if it comes as a stringified array from FormData
        let parsedPlatforms = platforms;

        if(typeof platforms === "string"){
            try {
                parsedPlatforms = JSON.parse(platforms);
            } catch(e) {
                parsedPlatforms = platforms.split(",");
            }
        }

        let mediaUrl: string | undefined = req.body.mediaUrl;
        let mediaType: "image" | "video" | undefined =
            req.body.mediaType;

        if(req.file){
            const result = await new Promise<any>(
                (resolve, reject) => {
                    const stream =
                        cloudinary.uploader.upload_stream(
                            {
                                resource_type: "auto",
                                folder: "social-scheduler"
                            },
                            (error, result) => {
                                if(error){
                                    reject(error);
                                } else {
                                    resolve(result);
                                }
                            }
                        );

                    stream.end(req.file!.buffer);
                }
            );

            mediaUrl = result.secure_url;
            mediaType =
                result.resource_type === "video"
                    ? "video"
                    : "image";
        }

        const post = await Post.create({
            user: req.user._id,
            content,
            platforms: parsedPlatforms,
            mediaUrl,
            mediaType,
            scheduledFor,
            status,
        });

        res.status(201).json(post);

    } catch(error: any){
        res.status(500).json({
            message: error?.message || "Server error"
        });
    }
};
