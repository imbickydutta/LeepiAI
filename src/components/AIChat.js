import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  Avatar,
  Chip,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Send,
  SmartToy,
  Person,
  Clear,
  AutoAwesome,
  Refresh,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiService from '../services/ApiService';

function AIChat({ transcript, onError, onSuccess }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load existing chat history and add welcome message when transcript changes
    if (transcript) {
      loadChatHistory();
    }
  }, [transcript?.id]);

  const loadChatHistory = async () => {
    try {
      const result = await apiService.getChatHistory(transcript.id);
      
      if (result.success && result.chatHistory && result.chatHistory.length > 0) {
        // Convert backend format to frontend format
        const historyMessages = result.chatHistory.map((msg, index) => ({
          id: `history_${index}`,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        }));
        
        // Add welcome message at the beginning
        const messagesWithWelcome = [
          {
            id: 'welcome',
            role: 'assistant',
            content: `Hi! I'm ready to help you analyze this interview transcript. You can ask me questions about the content, request insights, or get recommendations for improvement. What would you like to know?`,
            timestamp: new Date().toISOString()
          },
          ...historyMessages
        ];
        
        setMessages(messagesWithWelcome);
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: `Hi! I'm ready to help you analyze this interview transcript. You can ask me questions about the content, request insights, or get recommendations for improvement. What would you like to know?`,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('❌ Failed to load chat history:', error);
      // Fallback to welcome message only
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm ready to help you analyze this interview transcript. You can ask me questions about the content, request insights, or get recommendations for improvement. What would you like to know?`,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const result = await apiService.chatWithTranscript(transcript.id, userMessage.content, true);

      if (result.success) {
        const assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        onError('Failed to get AI response');
      }
    } catch (error) {
      onError('Failed to communicate with AI service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Chat cleared! I'm still here to help you analyze this interview transcript. What would you like to discuss?`,
      timestamp: new Date().toISOString()
    }]);
  };

  const handleRefreshChat = () => {
    loadChatHistory();
  };

  const handleQuickQuestion = (question) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  const quickQuestions = [
    "What are the key themes in this interview?",
    "How did the candidate perform overall?",
    "What questions were asked?",
    "What are the main strengths shown?",
    "What could be improved?",
    "Summarize the technical discussion"
  ];

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    
    return (
      <Box
        key={message.id}
        sx={{
          display: 'flex',
          flexDirection: isUser ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: 1,
          mb: 2,
        }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: isUser ? 'primary.main' : 'secondary.main',
            fontSize: '0.875rem',
          }}
        >
          {isUser ? <Person /> : <SmartToy />}
        </Avatar>
        
        <Paper
          sx={{
            p: 2,
            maxWidth: '70%',
            backgroundColor: isUser 
              ? 'primary.dark' 
              : 'background.paper',
            border: '1px solid #333',
          }}
        >
          {isUser ? (
            <Typography
              variant="body2"
              sx={{
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message.content}
            </Typography>
          ) : showRawMarkdown ? (
            <Typography
              variant="body2"
              component="pre"
              sx={{
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                p: 1,
                borderRadius: 1,
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {message.content}
            </Typography>
          ) : (
            <Box
              sx={{
                lineHeight: 1.5,
                wordBreak: 'break-word',
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                  color: 'text.primary',
                  fontWeight: 600,
                  mb: 1,
                  mt: 2,
                },
                '& h1': { fontSize: '1.5rem' },
                '& h2': { fontSize: '1.3rem' },
                '& h3': { fontSize: '1.1rem' },
                '& p': { mb: 1 },
                '& ul, & ol': { 
                  mb: 1, 
                  pl: 2,
                  '& li': { mb: 0.5 }
                },
                '& code': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                },
                '& pre': {
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  padding: '12px',
                  borderRadius: '6px',
                  overflow: 'auto',
                  '& code': {
                    backgroundColor: 'transparent',
                    padding: 0,
                  }
                },
                '& blockquote': {
                  borderLeft: '4px solid',
                  borderColor: 'primary.main',
                  pl: 2,
                  ml: 0,
                  fontStyle: 'italic',
                  color: 'text.secondary',
                },
                '& table': {
                  borderCollapse: 'collapse',
                  width: '100%',
                  mb: 1,
                  '& th, & td': {
                    border: '1px solid',
                    borderColor: 'divider',
                    padding: '8px',
                    textAlign: 'left',
                  },
                  '& th': {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    fontWeight: 600,
                  }
                },
                '& a': {
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline',
                  }
                },
                '& input[type="checkbox"]': {
                  marginRight: '8px',
                },
                '& .task-list-item': {
                  listStyle: 'none',
                  '& input[type="checkbox"]': {
                    marginRight: '8px',
                  }
                },
                '& .task-list-item-checkbox': {
                  marginRight: '8px',
                }
              }}
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom component overrides for better styling
                  h1: ({children}) => <Typography variant="h5" component="h1">{children}</Typography>,
                  h2: ({children}) => <Typography variant="h6" component="h2">{children}</Typography>,
                  h3: ({children}) => <Typography variant="subtitle1" component="h3">{children}</Typography>,
                  p: ({children}) => <Typography variant="body2" component="p">{children}</Typography>,
                  li: ({children}) => <Typography variant="body2" component="li">{children}</Typography>,
                  code: ({node, inline, className, children, ...props}) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <pre {...props}>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </Box>
          )}
          
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ 
              display: 'block', 
              mt: 1, 
              textAlign: isUser ? 'right' : 'left' 
            }}
          >
            {formatTimestamp(message.timestamp)}
          </Typography>
        </Paper>
      </Box>
    );
  };

  if (!transcript) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}>
        <Typography color="text.secondary">
          Select a transcript to start chatting with AI
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: '#1a1a1a',
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToy sx={{ color: 'secondary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            AI Assistant
          </Typography>
          <Chip 
            label="Powered by Gemini" 
            size="small" 
            variant="outlined"
            sx={{ fontSize: '0.7rem', mr: 1 }}
          />
          <Chip 
            label="Markdown" 
            size="small" 
            variant="outlined"
            color="secondary"
            sx={{ fontSize: '0.7rem' }}
          />
        </Box>
        
        <Button
          size="small"
          onClick={() => setShowRawMarkdown(!showRawMarkdown)}
          variant={showRawMarkdown ? "contained" : "outlined"}
          sx={{ color: 'text.secondary', mr: 1 }}
        >
          {showRawMarkdown ? 'Hide' : 'Show'} Raw
        </Button>
        
        <Button
          size="small"
          onClick={handleRefreshChat}
          startIcon={<Refresh />}
          sx={{ color: 'text.secondary', mr: 1 }}
        >
          Refresh
        </Button>
        
        <Button
          size="small"
          onClick={handleClearChat}
          startIcon={<Clear />}
          sx={{ color: 'text.secondary' }}
        >
          Clear
        </Button>
      </Box>

      {/* Messages */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto', 
        p: 2,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {messages.length === 0 ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            gap: 2,
          }}>
            <AutoAwesome sx={{ fontSize: 48, color: 'secondary.main' }} />
            <Typography variant="h6" color="text.secondary">
              Start a conversation with AI
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ask questions about the transcript, request analysis, or get insights
            </Typography>
          </Box>
        ) : (
          <>
            {messages.map(renderMessage)}
            
            {isLoading && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1, 
                p: 2,
                color: 'text.secondary',
              }}>
                <CircularProgress size={16} />
                <Typography variant="body2">
                  AI is thinking...
                </Typography>
              </Box>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>

      {/* Quick Questions */}
      {messages.length <= 1 && (
        <Box sx={{ 
          p: 2, 
          borderTop: '1px solid #333',
          borderBottom: '1px solid #333',
        }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Quick questions:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {quickQuestions.map((question, index) => (
              <Chip
                key={index}
                label={question}
                size="small"
                variant="outlined"
                onClick={() => handleQuickQuestion(question)}
                sx={{ 
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Input */}
      <Box sx={{ 
        p: 2, 
        borderTop: '1px solid #333',
        display: 'flex',
        gap: 1,
        alignItems: 'flex-end',
      }}>
        <TextField
          ref={inputRef}
          fullWidth
          multiline
          maxRows={3}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask me anything about this transcript..."
          disabled={isLoading}
          variant="outlined"
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        />
        
        <IconButton
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isLoading}
          color="primary"
          sx={{ 
            p: 1,
            backgroundColor: inputValue.trim() ? 'primary.main' : 'transparent',
            color: inputValue.trim() ? 'white' : 'text.secondary',
            '&:hover': {
              backgroundColor: inputValue.trim() ? 'primary.dark' : 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          {isLoading ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <Send />
          )}
        </IconButton>
      </Box>
    </Box>
  );
}

export default AIChat; 