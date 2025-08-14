import React, { useState } from "react";
import { Heart, MessageCircle, Send, Bookmark } from "lucide-react";

interface InstagramMockProps {
  content: string;
  maxLength?: number; // optional max length for preview
}

export const InstagramMock: React.FC<InstagramMockProps> = ({
  content,
  maxLength = 150, // default preview length
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => setExpanded(!expanded);

  const displayContent =
    content.length > maxLength && !expanded
      ? content.slice(0, maxLength) + "..."
      : content;

  return (
    <div className="bg-white text-black rounded-lg p-4 max-w-md mx-auto">
      <div className="flex items-center mb-3">
        <div className="w-8 h-8 bg-gray-300 rounded-full mr-3"></div>
        <p className="font-bold">Your Name</p>
      </div>

      <div className="bg-gray-200 h-64 mb-3 flex items-center justify-center">
        <span className="text-gray-500">Image Placeholder</span>
      </div>

      <div className="flex justify-between mb-3">
        <div className="flex space-x-4">
          <Heart size={24} />
          <MessageCircle size={24} />
          <Send size={24} />
        </div>
        <Bookmark size={24} />
      </div>

      <p className="text-sm">
        {displayContent}{" "}
        {content.length > maxLength && (
          <span
            className="text-blue-500 cursor-pointer"
            onClick={toggleExpand}
          >
            {expanded ? "less" : "more"}
          </span>
        )}
      </p>
    </div>
  );
};
