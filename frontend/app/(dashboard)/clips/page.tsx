"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ClipCard {
  id: string
  title: string
  duration: string
  createdAt: string
  thumbnail: string
}

const mockClips: ClipCard[] = [
  {
    id: "1",
    title: "Amazing Play Highlight",
    duration: "0:30",
    createdAt: "2024-03-20",
    thumbnail: "https://placehold.co/400x225",
  },
  {
    id: "2",
    title: "Team Fight Compilation",
    duration: "1:15",
    createdAt: "2024-03-19",
    thumbnail: "https://placehold.co/400x225",
  },
  {
    id: "3",
    title: "Epic Moment",
    duration: "0:45",
    createdAt: "2024-03-18",
    thumbnail: "https://placehold.co/400x225",
  },
]

export default function ClipsPage() {
  const [clips] = useState<ClipCard[]>(mockClips)

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">My Clips</h1>
          <p className="text-muted-foreground mt-2">
            Manage and organize your gaming highlights
          </p>
        </div>
        <Button size="lg">
          Create New Clip
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clips.map((clip) => (
          <Card key={clip.id} className="overflow-hidden">
            <div className="relative aspect-video">
              <Image
                src={clip.thumbnail}
                alt={clip.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
              <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-sm z-10">
                {clip.duration}
              </div>
            </div>
            <CardHeader>
              <CardTitle className="text-xl">{clip.title}</CardTitle>
              <CardDescription>Created on {clip.createdAt}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Edit</Button>
                <Button variant="outline" size="sm">Share</Button>
                <Button variant="destructive" size="sm">Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {clips.length === 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>No clips yet</CardTitle>
            <CardDescription>
              Start by creating your first gaming highlight clip
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Create Your First Clip</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 