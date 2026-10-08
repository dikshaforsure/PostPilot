import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddlewware.js";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { cloudinary } from "../config/cloudinary.js";
import { Generation } from "../models/Generation.js";
import { Post } from "../models/Post.js";


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const generateGeminiContent = async (ai: GoogleGenAI, prompt: string, tone: string) => {
    const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
    let lastError: any;

    for (const model of models) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                return await ai.models.generateContent({
                    model,
                    contents: `Generate a social media post based on this prompt: "${prompt}". 
                    Tone: ${tone}. 
                    Include relevant hashtags.
                    Format the response as JSON with "content" and "imagePrompt" fields. 
                    The "imagePrompt" should be a highly descriptive prompt for an image generator that complements the post.`,
                });
            } catch (error: any) {
                lastError = error;

                const status = error?.status ?? error?.code ?? error?.response?.status;
                const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

                if (!retryable || attempt === 3) {
                    break;
                }

                const delay = 1000 * attempt;
                console.warn(`Gemini model ${model} returned ${status}. Retrying in ${delay}ms (attempt ${attempt}/3)...`);
                await sleep(delay);
            }
        }

        console.warn(`Gemini model ${model} was unavailable. Trying the next model...`);
    }

    throw lastError || new Error("No Gemini model was available.");
};


// Generate post
// POST /api/posts/generate
export const generatePost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { prompt, tone, generateImage } = req.body;

        const apiKey = process.env.GEMINI_API_KEY;
        if(!apiKey){
            res.status(400).json({message: "Gemini API Key is missing. Please add it to your server/.env file." });
            return;
        }

        const ai = new GoogleGenAI({apiKey});

        // Generate Text
        // Use the free, lightweight model first and fall back to Gemini 3.8 Flash
        // if the primary model is temporarily unavailable.
        const textResponse = await generateGeminiContent(ai, prompt, tone);

        let content = "";
        let imagePrompt = prompt;

        try {
            const rawText = textResponse.text || "";
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {content: rawText, imagePrompt: prompt};
            content = data.content;
            imagePrompt = data.imagePrompt;
        } catch (e) {
            content = textResponse.text || ""
        }

        let mediaUrl = "";
        if(generateImage){
           try {
            const stabilityKey = process.env.STABILITY_API_KEY;

            if(stabilityKey){
                // Use Stability AI SDXL 1.0 for image generation
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

                const base64Image = stabilityResponse.data?.artifacts?.[0]?.base64;

                if(!base64Image){
                    throw new Error("Stability AI did not return an image.");
                }

                // Upload the generated image to Cloudinary for persistence
                const imageBuffer = Buffer.from(base64Image, "base64");

                const uploadResult = await new Promise<any>((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        {
                            folder: "ai-generations",
                            resource_type: "image",
                        },
                        (error, result) => {
                            if(error) reject(error);
                            else resolve(result);
                        }
                    );

                    stream.end(imageBuffer);
                });

                mediaUrl = uploadResult.secure_url;
            }
           } catch (err: any) {
                console.error(
                    "Image generation failed:",
                    err?.response?.data || err?.message || err
                );
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
          })

          res.json(generation)
        
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Get generations
// GET /api/posts/generations
export const getGenerations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const generations = await Generation.find({user: req.user._id}).sort({createdAt: -1})
        res.json(generations)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Get posts
// GET /api/posts
export const getPosts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const posts = await Post.find({user: req.user._id})
        res.json(posts)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Schedule post
// POST /api/posts
export const schedulePost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { content, platforms, scheduledFor, status } = req.body;

        // Parse platforms if it comes as a stringified array from FormData
        let parsedPlatforms = platforms;
        if(typeof platforms === "string"){
            try {
                parsedPlatforms = JSON.parse(platforms)
            } catch (e) {
                parsedPlatforms = platforms.split(",");
            }
        }

        let mediaUrl: string | undefined = req.body.mediaUrl;
        let mediaType: "image" | "video" | undefined = req.body.mediaType;

        if(req.file){
            const result = await new Promise<any>((resolve, reject)=>{
                const stream = cloudinary.uploader.upload_stream({resource_type: "auto", folder: "social-scheduler"}, (error, result)=>{
                    if(error) reject(error);
                    else resolve(result)
                });
                stream.end(req.file!.buffer);
            });
            mediaUrl = result.secure_url;
            mediaType = result.resource_type === "video" ? "video" : "image";
        }

        const post = await Post.create({
            user: req.user._id,
            content,
            platforms: parsedPlatforms,
            mediaUrl,
            mediaType,
            scheduledFor,
            status,
        })
        res.status(201).json(post)

    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}
