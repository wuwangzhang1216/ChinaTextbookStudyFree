"use client";

import { useEffect, useState } from "react";
import { readingId } from "@cstf/core/reading";
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
  const completedReadings = useProgressStore(s => s.completedReadings);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const audioReady = story.sentences.some(s => s.audio);
  // 查询键与写入键同源：core 规范阅读 id `reading:story:{storyId}`
  const done = hydrated && completedReadings[readingId("story", story.id)] != null;

  return (
    <SoundLink
      href={`/stories/${bookId}/${story.id}/`}
      className={cn(
        "block rounded-2xl bg-white border-2 overflow-hidden hover:border-primary/40 transition-colors",
        done ? "border-primary/30" : "border-bg-softer",
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
            done ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary-dark",
          )}
        >
          <Book className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-extrabold text-ink leading-snug">
            {story.title}
          </div>
          <div className="text-xs text-ink-light mt-0.5 flex items-center gap-1">
            {done ? (
              <span className="inline-flex items-center gap-1 text-primary font-bold">
                <Star className="w-3.5 h-3.5 fill-current" />
                已读完
              </span>
            ) : (
              <span>
                {story.sentences.length} 句 · {story.questions.length} 道题
                {!audioReady && " · 音频生成中"}
              </span>
            )}
          </div>
        </div>
        {audioReady && !done && (
          <Volume className="w-5 h-5 text-primary shrink-0" />
        )}
      </div>
    </SoundLink>
  );
}
