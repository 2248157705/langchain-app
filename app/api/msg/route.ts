interface Message {
  id: string;
  content: string;
  author: string;
  timestamp: string;
}

let messages: Message[] = [
  { id: '1', content: 'Hello World', author: 'Alice', timestamp: new Date().toISOString() },
  { id: '2', content: 'How are you?', author: 'Bob', timestamp: new Date().toISOString() },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const message = messages.find(msg => msg.id === id);
    if (!message) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }
    return Response.json({ message });
  }

  return Response.json({ 
    messages,
    total: messages.length 
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content, author } = body;

    if (!content || !author) {
      return Response.json({ error: 'Content and author are required' }, { status: 400 });
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      author,
      timestamp: new Date().toISOString(),
    };

    messages.push(newMessage);

    return Response.json({ 
      message: newMessage,
      message: 'Message created successfully' 
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { content, author } = body;

    const messageIndex = messages.findIndex(msg => msg.id === id);
    if (messageIndex === -1) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    messages[messageIndex] = {
      ...messages[messageIndex],
      ...(content && { content }),
      ...(author && { author }),
      timestamp: new Date().toISOString(),
    };

    return Response.json({ 
      message: messages[messageIndex],
      message: 'Message updated successfully' 
    });
  } catch (error) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'Message ID is required' }, { status: 400 });
  }

  const messageIndex = messages.findIndex(msg => msg.id === id);
  if (messageIndex === -1) {
    return Response.json({ error: 'Message not found' }, { status: 404 });
  }

  messages.splice(messageIndex, 1);

  return Response.json({ 
    message: 'Message deleted successfully' 
  });
}
