"use client";

import { useEffect, useState } from "react";
import { Book, Volume, Star } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { useProgressStore } from "@/store/progress";
import { cn } from "@/lib/cn";
import type { Story } from "@/types";

interface Props {
  story: Story;
  bookId: string;
}

export function StoryCard({ story, bookId }: Props) {
  const completedLessons = useProgressStore(s => s.completedLessons);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const audioReady = story.sentences.some(s => s.audio);
  const result = hydrated ? completedLessons[`story-${story.id}`] : undefined;
  const stars = result?.stars ?? 0;

  return (
    <SoundLink
      href={`/stories/${bookId}/${story.id}/`}
      className={cn(
        "block rounded-2xl bg-white border overflow-hidden hover:border-primary/40 transition-colors",
        stars > 0 ? "border-success/30" : "border-bg-softer",
      )}
    >
      {/* 配图 */}
      {story.image && (
        <div className="w-full aspect-[2/1] overflow-hidden bg-bg-softer">
          <img
            src={story.image}
            alt={story.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "shrink-0 w-10 h-10 rounded-full inline-flex items-center justify-center",
            stars > 0 ? "bg-success/10 text-success" : "bg-gold/10 text-gold",
          )}
        >
          <Book className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-ink truncate">
            {story.title}
          </div>
          <div className="text-xs text-ink-light mt-0.5 flex items-center gap-1">
            {stars > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                {[1, 2, 3].map(n => (
                  <Star
                    key={n}
                    className={cn(
                      "w-3.5 h-3.5",
                      n <= stars ? "fill-current text-gold" : "text-bg-softer",
                    )}
                  />
                ))}
              </span>
            ) : (
              <span>
                {story.sentences.length} 句 · {story.questions.length} 道题
                {!audioReady && " · 音频生成中"}
              </span>
            )}
          </div>
        </div>
        {audioReady && !stars && (
          <Volume className="w-5 h-5 text-primary shrink-0" />
        )}
      </div>
    </SoundLink>
  );
}
