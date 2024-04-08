import { db } from "@/db";
import { pinecone } from "@/lib/pinecone";
import { SendMessageValidator } from "@/lib/validators/SendMessageValidator";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { PineconeStore } from "@langchain/pinecone";
import { NextRequest } from "next/server";
import { openai } from "@/lib/openai";

import { OpenAIStream, StreamingTextResponse } from 'ai'

export const POST = async (req: NextRequest) => {
    const body = await req.json();

    const { getUser } = getKindeServerSession();
    const user = getUser();
    const { id: userId } = user

    if (!userId) {
        return new Response('Unauthorized', { status: 401 });
    }

    const { fileId, message } = SendMessageValidator.parse(body);

    const file = await db.file.findFirst({
        where: {
            id: fileId,
            userId,
        }
    });

    if (!file)
        return new Response('File not found', { status: 404 });

    await db.message.create({
        data: {
            text: message,
            isUserMessage: true,
            userId,
            fileId,
        } as any
    })

    const embeddings = new OpenAIEmbeddings()
    const pineconeIndex = pinecone.Index('doctalk')

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace: file.id
    })
    const results = await vectorStore.similaritySearch(message, 4);

    const prevMessages = await db.message.findMany({
        where: {
            fileId,
        } as any,
        orderBy: {
            createdAt: 'asc',
        },
        take: 6,
    })

    const formattedPrevMessages = prevMessages.map((msg) => ({
        role: msg.isUserMessage
            ? ('user' as const)
            : ('assistant' as const),
        content: msg.text,
    }))

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0,
        stream: true,
        messages: [
            {
                role: 'system',
                content:
                    'Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format.',
            },
            {
                role: 'user',
                content: `Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format. \nIf you don't know the answer, just say that you don't know, don't try to make up an answer.
            
      
      ${formattedPrevMessages.map((message) => {
                    if (message.role === 'user')
                        return `User: ${message.content}\n`
                    return `Assistant: ${message.content}\n`
                })}
      
      
      ${results.map((r) => r.pageContent).join('\n\n')}
      
      USER INPUT: ${message}`,
            },
        ],
    })

    const stream = OpenAIStream(response, {
        async onCompletion(completion) {
            await db.message.create({
                data: {
                    text: completion,
                    isUserMessage: false,
                    fileId,
                    userId,
                } as any,
            })
        },
    })

    return new StreamingTextResponse(stream)


}