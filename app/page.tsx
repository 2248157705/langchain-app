'use client';

import { useState } from 'react';

export default function Home() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setResponse('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      setResponse(data.response || 'No response received');
    } catch (error) {
      setResponse('Error: Failed to get response');
    } finally {
      setLoading(false);
    }
  };

  const testOllama=()=>{
    console.log('9999',)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black p-4">
      <main className="w-full max-w-3xl">
        <div className="bg-white dark:bg-black rounded-lg shadow-lg p-6 sm:p-8">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-6 text-center">
            LangChain Chat
          </h1>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-zinc-900 text-black dark:text-zinc-50"
                rows={4}
                placeholder="Enter your message..."
                disabled={loading}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </form>

          {response && (
            <div className="mt-6 p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
              <h2 className="text-lg font-medium text-black dark:text-zinc-50 mb-2">
                Response:
              </h2>
              <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {response}
              </p>
            </div>
          )}
        </div>


        <div style={{width:100,height:50,textAlign:'center',lineHeight:'50px',border:'1px solid red'}} onClick={testOllama}>
          test
        </div>
      </main>
    </div>
  );
}
