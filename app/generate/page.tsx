"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Upload,
  Copy,
  Twitter,
  Instagram,
  Linkedin,
  Clock,
  Zap,
} from "lucide-react";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import { Navbar } from "@/components/Navbar";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  getUserPoints,
  saveGeneratedContent,
  updateUserPoints,
  getGeneratedContentHistory,
  createOrUpdateUser,
} from "@/utils/db/actions";
import { TwitterMock } from "@/components/social-mocks/TwitterMock";
import { InstagramMock } from "@/components/social-mocks/InstagramMock";
import { LinkedInMock } from "@/components/social-mocks/LinkedInMock";
import Link from "next/link";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const contentTypes = [
  { value: "twitter", label: "Twitter Thread" },
  { value: "instagram", label: "Instagram Caption" },
  { value: "linkedin", label: "LinkedIn Post" },
];

const MAX_TWEET_LENGTH = 280;
const POINTS_PER_GENERATION = 5;

interface HistoryItem {
  id: number;
  contentType: string;
  prompt: string;
  content: string;
  createdAt: Date;
}

export default function GenerateContent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  const [contentType, setContentType] = useState(contentTypes[0].value);
  const [prompt, setPrompt] = useState("");
  const [generatedContent, setGeneratedContent] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] =
    useState<HistoryItem | null>(null);

  useEffect(() => {
    if (!apiKey) {
      console.error("Gemini API key is not set");
    }
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/");
    } else if (isSignedIn && user) {
      console.log("User loaded:", user);
      fetchUserPoints();
      fetchContentHistory();
    }
  }, [isLoaded, isSignedIn, user, router, userPoints]);

  const fetchUserPoints = async () => {
    if (user?.id) {
      console.log("Fetching points for user:", user.id);
      const points = await getUserPoints(user.id);
      console.log("Fetched points:", points);
      setUserPoints(points);
      if (points === 0) {
        console.log("User has 0 points. Attempting to create/update user.");
        const updatedUser = await createOrUpdateUser(
          user.id,
          user.emailAddresses[0].emailAddress,
          user.fullName || ""
        );
        console.log("Updated user:", updatedUser);
        if (updatedUser) {
          setUserPoints(updatedUser.points);
        }
      }
    }
  };

  const fetchContentHistory = async () => {
    if (user?.id) {
      const contentHistory = await getGeneratedContentHistory(user.id);
      setHistory(contentHistory);
    }
  };

const handleGenerate = async () => {
  if (isLoading) return;

  if (
    !genAI ||
    !user?.id ||
    userPoints === null ||
    userPoints < POINTS_PER_GENERATION
  ) {
    alert("Not enough points or API key not set.");
    return;
  }

  setIsLoading(true);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // Prompt engineering: structured format with multiple options
    let promptText = `Generate ${contentType} content about "${prompt}".`;

    if (contentType === "instagram") {
      promptText += `
Generate 3 options. Each option should have:
- Image description (a few words)
- Caption (2-5 sentences, Instagram-style)
- Use hashtags at the end, like #DreamCar #Achievement

Format the output as JSON like this:
[
  {
    "image": "short image description",
    "caption": "Your Instagram caption with hashtags"
  },
  ...
]
`;
    } else if (contentType === "twitter") {
      promptText +=
        " Provide a thread of 5 tweets, each under 280 characters, numbered 1-5.";
    }

    let imagePart: Part | null = null;
    if (contentType === "instagram" && image) {
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) =>
          resolve((e.target?.result as string)?.split(",")[1] || "");
        reader.readAsDataURL(image);
      });

      if (base64Data) {
        imagePart = {
          inlineData: {
            data: base64Data,
            mimeType: image.type,
          },
        };
        promptText +=
          " Incorporate the uploaded image into the captions if possible.";
      }
    }

    const parts: (string | Part)[] = [promptText];
    if (imagePart) parts.push(imagePart);

    const result = await model.generateContent(parts);
    const generatedText = result.response.text();

    let content: string[] = [];

    if (contentType === "instagram") {
      try {
        // Parse JSON structure from the AI output
        const options = JSON.parse(generatedText) as Array<{
          image: string;
          caption: string;
        }>;
        // Pick the first option for preview
        content = options.map((opt) => opt.caption);
      } catch {
        content = [generatedText]; // fallback
      }
    } else if (contentType === "twitter") {
      content = generatedText
        .split("\n\n")
        .filter((tweet) => tweet.trim() !== "");
    }

    setGeneratedContent(content);

    const updatedUser = await updateUserPoints(user.id, -POINTS_PER_GENERATION);
    if (updatedUser) setUserPoints(updatedUser.points);

    const savedContent = await saveGeneratedContent(
      user.id,
      content.join("\n\n"),
      prompt,
      contentType
    );
    if (savedContent) {
      setHistory((prevHistory) => [savedContent, ...prevHistory]);
    }
  } catch (error) {
    console.error("Error generating content:", error);
    setGeneratedContent(["An error occurred while generating content."]);
  } finally {
    setIsLoading(false);
  }
};


  const handleHistoryItemClick = (item: HistoryItem) => {
    setSelectedHistoryItem(item);
    setContentType(item.contentType);
    setPrompt(item.prompt);
    setGeneratedContent(
      item.contentType === "twitter"
        ? item.content.split("\n\n")
        : [item.content]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderContentMock = () => {
    if (generatedContent.length === 0) return null;

    switch (contentType) {
      case "twitter":
        return <TwitterMock content={generatedContent} />;
      case "instagram":
        return <InstagramMock content={generatedContent[0]} />;
      case "linkedin":
        return <LinkedInMock content={generatedContent[0]} />;
      default:
        return null;
    }
  };

  if (!isLoaded) {
    return <div>Loading...</div>;
  }


  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setImage(event.target.files[0]);
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black min-h-screen text-white">
      <Navbar />
      <div className="container mx-auto px-4 mb-8 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 mt-14 lg:grid-cols-3 gap-8">
          {/* Left sidebar - History */}
          <div className="lg:col-span-1 bg-gray-800 rounded-2xl p-6 h-[calc(100vh-12rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-blue-400">History</h2>
              <Clock className="h-6 w-6 text-blue-400" />
            </div>
            <div className="space-y-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-gray-700 rounded-xl hover:bg-gray-600 transition-colors cursor-pointer"
                  onClick={() => handleHistoryItemClick(item)}
                >
                  <div className="flex items-center mb-2">
                    {item.contentType === "twitter" && (
                      <Twitter className="mr-2 h-5 w-5 text-blue-400" />
                    )}
                    {item.contentType === "instagram" && (
                      <Instagram className="mr-2 h-5 w-5 text-pink-400" />
                    )}
                    {item.contentType === "linkedin" && (
                      <Linkedin className="mr-2 h-5 w-5 text-blue-600" />
                    )}
                    <span className="text-sm font-medium">
                      {item.contentType}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 truncate">
                    {item.prompt}
                  </p>
                  <div className="flex items-center text-xs text-gray-400 mt-2">
                    <Clock className="mr-1 h-3 w-3" />
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main content area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Points display */}
            <div className="bg-gray-800 p-6 rounded-2xl flex items-center justify-between">
              <div className="flex items-center">
                <Zap className="h-8 w-8 text-yellow-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-400">Available Points</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {userPoints !== null ? userPoints : "Loading..."}
                  </p>
                </div>
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-full transition-colors">
                <Link href="/pricing">Get More Points</Link>
              </Button>
            </div>

            {/* Content generation form */}
            <div className="bg-gray-800 p-6 rounded-2xl space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Content Type
                </label>
                <Select
                  onValueChange={setContentType}
                  defaultValue={contentType}
                >
                  <SelectTrigger className="w-full bg-gray-700 border-none rounded-xl">
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    {contentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center">
                          {type.value === "twitter" && (
                            <Twitter className="mr-2 h-4 w-4 text-blue-400" />
                          )}
                          {type.value === "instagram" && (
                            <Instagram className="mr-2 h-4 w-4 text-pink-400" />
                          )}
                          {type.value === "linkedin" && (
                            <Linkedin className="mr-2 h-4 w-4 text-blue-600" />
                          )}
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="prompt"
                  className="block text-sm font-medium mb-2 text-gray-300"
                >
                  Prompt
                </label>
                <Textarea
                  id="prompt"
                  placeholder="Enter your prompt here..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-gray-700 border-none rounded-xl resize-none"
                />
              </div>

              {contentType === "instagram" && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Upload Image
                  </label>
                  <div className="flex items-center space-x-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className="cursor-pointer flex items-center justify-center px-4 py-2 bg-gray-700 rounded-xl text-sm font-medium hover:bg-gray-600 transition-colors"
                    >
                      <Upload className="mr-2 h-5 w-5" />
                      <span>Upload Image</span>
                    </label>
                    {image && (
                      <span className="text-sm text-gray-400">
                        {image.name}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={
                  isLoading ||
                  !prompt ||
                  userPoints === null ||
                  userPoints < POINTS_PER_GENERATION
                }
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  `Generate Content (${POINTS_PER_GENERATION} points)`
                )}
              </Button>
            </div>

            {/* Generated content display */}
            {(selectedHistoryItem || generatedContent.length > 0) && (
              <div className="bg-gray-800 p-6 rounded-2xl space-y-4">
                <h2 className="text-2xl font-semibold text-blue-400">
                  {selectedHistoryItem ? "History Item" : "Generated Content"}
                </h2>
                {contentType === "twitter" ? (
                  <div className="space-y-4">
                    {(selectedHistoryItem
                      ? selectedHistoryItem.content.split("\n\n")
                      : generatedContent
                    ).map((tweet, index) => (
                      <div
                        key={index}
                        className="bg-gray-700 p-4 rounded-xl relative"
                      >
                        <ReactMarkdown className="prose prose-invert max-w-none mb-2 text-sm">
                          {tweet}
                        </ReactMarkdown>
                        <div className="flex justify-between items-center text-gray-400 text-xs mt-2">
                          <span>
                            {tweet.length}/{MAX_TWEET_LENGTH}
                          </span>
                          <Button
                            onClick={() => copyToClipboard(tweet)}
                            className="bg-gray-600 hover:bg-gray-500 text-white rounded-full p-2 transition-colors"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-700 p-4 rounded-xl">
                    <ReactMarkdown className="prose prose-invert max-w-none text-sm">
                      {selectedHistoryItem
                        ? selectedHistoryItem.content
                        : generatedContent[0]}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            {/* Content preview */}
            {generatedContent.length > 0 && (
              <div className="bg-gray-800 p-6 rounded-2xl">
                <h2 className="text-2xl font-semibold mb-4 text-blue-400">
                  Preview
                </h2>
                {renderContentMock()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
