# Session Management for Segmented Recordings

## Overview

The LeepiAI application now properly handles segmented recordings by grouping multiple audio chunks into a single session. This ensures that one recording session with multiple segments is treated as a unified entity rather than separate recordings.

## How Session Management Works

### 1. **Session Creation**
When a segmented recording starts:

```javascript
// Generate unique session ID
const sessionId = `session_${Date.now()}_${userId}`;

// Create parent session
const parentSession = await databaseService.createParentSession({
  userId: userId,
  sessionId: sessionId,
  title: `Segmented Recording - ${date}`,
  metadata: {
    totalSegments: expectedSegments,
    recordingType: 'segmented',
    sessionStartTime: new Date()
  }
});
```

### 2. **Chunk Processing**
Each audio segment is processed individually and linked to the parent session:

```javascript
// Process each segment
for (let i = 0; i < segments.length; i++) {
  try {
    // Process audio segment
    const result = await audioService.transcribeDualAudio(micFile, sysFile);
    
    if (result.success) {
      // Save successful chunk
      await databaseService.addChunkToSession(parentSession.id, {
        userId: userId,
        sessionId: sessionId,
        title: `Segment ${i + 1} - Success`,
        status: 'completed',
        audioFiles: [...],
        metadata: {
          segmentIndex: i,
          duration: result.duration,
          // ... other metadata
        }
      });
    } else {
      // Save failed chunk for retry
      await databaseService.addChunkToSession(parentSession.id, {
        // ... chunk data with error
        status: 'failed',
        error: result.error
      });
    }
  } catch (error) {
    // Handle unexpected errors
  }
}
```

### 3. **Session Completion**
After all segments are processed:

```javascript
// Update parent session with final status
const finalStatus = failedChunks === 0 ? 'completed' : 'completed_with_errors';
await databaseService.updateRecording(parentSession.id, {
  status: finalStatus,
  transcriptId: savedTranscript.id,
  completedAt: new Date(),
  metadata: {
    sessionEndTime: new Date(),
    totalDuration: totalDuration,
    successfulChunks: successfulChunks,
    failedChunks: failedChunks
  }
});
```

## Database Schema

### Parent Session
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  sessionId: String,           // Unique session identifier
  isParentSession: true,       // Indicates this is a parent
  title: String,
  status: String,              // pending|processing|completed|completed_with_errors|failed
  chunkRecordingIds: [ObjectId], // Array of chunk recording IDs
  transcriptId: ObjectId,      // Final transcript (if successful)
  metadata: {
    totalSegments: Number,     // Expected total segments
    successfulChunks: Number,  // Successfully processed chunks
    failedChunks: Number,      // Failed chunks
    totalDuration: Number,     // Combined duration
    sessionStartTime: Date,
    sessionEndTime: Date
  }
}
```

### Chunk Recordings
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  sessionId: String,           // Same as parent
  isParentSession: false,      // Indicates this is a chunk
  parentSessionId: String,     // Parent session ID
  parentRecordingId: ObjectId, // Reference to parent recording
  title: String,               // "Segment X - Status"
  status: String,              // pending|completed|failed
  audioFiles: [AudioFile],
  metadata: {
    segmentIndex: Number,      // 0-based segment index
    duration: Number,          // Individual segment duration
    // ... other metadata
  },
  error: String                // Error message if failed
}
```

## Frontend Display

### Session Grouping
The RecordingsManager component groups recordings by session:

```javascript
// Get parent sessions (grouped recordings)
const parentSessions = await Recording.getParentSessions(userId);

// Format response with session details
const recordings = await Promise.all(parentSessions.map(async (session) => {
  const chunks = await Recording.find({ 
    _id: { $in: session.chunkRecordingIds } 
  }).sort({ 'metadata.currentSegment': 1 });

  return {
    id: session._id,
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    isParentSession: true,
    audioFiles: chunks.flatMap(chunk => chunk.audioFiles || []),
    metadata: {
      ...session.metadata,
      totalChunks: chunks.length,
      chunkStatuses: chunks.map(chunk => ({
        id: chunk._id,
        status: chunk.status,
        segmentIndex: chunk.metadata?.segmentIndex,
        error: chunk.error
      }))
    }
  };
}));
```

### Visual Indicators
- **Session Badge**: Shows "Session" label for grouped recordings
- **Segment Count**: Displays total number of segments
- **Chunk Statuses**: Shows individual segment statuses
- **Session ID**: Unique identifier for the recording session

## Benefits of Session Management

### 1. **Data Integrity**
- All segments from one recording session are grouped together
- No orphaned audio chunks
- Consistent session-level metadata

### 2. **User Experience**
- Users see one recording entry per session
- Clear overview of session progress
- Easy retry of failed sessions

### 3. **Storage Management**
- Session-level audio file deletion
- Bulk operations on related chunks
- Better storage analytics

### 4. **Error Handling**
- Failed segments don't break the entire session
- Partial success handling
- Granular retry capabilities

## Retry Functionality

### Session-Level Retry
When retrying a failed session:

```javascript
// Get all chunks for the session
const session = await databaseService.getCompleteSession(userId, sessionId);
const chunks = session.metadata.chunks;

// Retry failed chunks
for (const chunk of chunks) {
  if (chunk.status === 'failed') {
    // Reprocess the chunk
    const result = await audioService.transcribeDualAudio(
      chunk.audioFiles.find(f => f.type === 'input')?.path,
      chunk.audioFiles.find(f => f.type === 'output')?.path
    );
    
    if (result.success) {
      // Update chunk status
      await databaseService.updateRecording(chunk.id, {
        status: 'completed',
        error: null
      });
    }
  }
}

// Update session status
await databaseService.updateRecording(session.id, {
  status: 'completed',
  completedAt: new Date()
});
```

### Chunk-Level Retry
Individual chunks can also be retried:

```javascript
// Retry specific chunk
const result = await apiService.retryRecording(chunkId);

if (result.success) {
  // Chunk successfully reprocessed
  // Session status may be updated if all chunks are now successful
}
```

## API Endpoints

### Session Management
```
GET    /api/recordings              # Get recordings grouped by session
GET    /api/recordings/:id          # Get specific recording/session
POST   /api/recordings/:id/retry    # Retry failed recording/session
DELETE /api/recordings/:id/audio    # Delete audio files only
DELETE /api/recordings/:id          # Delete entire session
```

### Response Format
```javascript
{
  success: true,
  recordings: [
    {
      id: "recording_id",
      sessionId: "session_123",
      isParentSession: true,
      title: "Interview Recording",
      status: "completed",
      metadata: {
        totalSegments: 5,
        successfulChunks: 5,
        failedChunks: 0,
        totalDuration: 300,
        chunkStatuses: [
          { id: "chunk1", status: "completed", segmentIndex: 0 },
          { id: "chunk2", status: "completed", segmentIndex: 1 }
          // ... more chunks
        ]
      }
    }
  ]
}
```

## Error Scenarios

### 1. **Partial Session Failure**
- Some segments succeed, others fail
- Session marked as "completed_with_errors"
- Failed segments can be retried individually

### 2. **Complete Session Failure**
- All segments fail
- Session marked as "failed"
- Entire session can be retried

### 3. **Network Interruptions**
- Failed segments are preserved
- Session can be resumed
- No data loss during interruptions

## Future Enhancements

### Planned Features
- **Batch Retry**: Retry multiple failed sessions
- **Session Merging**: Combine related sessions
- **Progress Tracking**: Real-time session progress
- **Auto-Retry**: Automatic retry of failed segments

### Performance Optimizations
- **Lazy Loading**: Load chunk details on demand
- **Caching**: Cache session metadata
- **Background Processing**: Process chunks in background

## Conclusion

The session management system ensures that segmented recordings are properly grouped and managed as single entities. This provides:

- **Better Data Organization**: Related audio chunks are grouped together
- **Improved User Experience**: Clear session overview and status
- **Robust Error Handling**: Failed segments don't break entire sessions
- **Flexible Retry Options**: Session-level and chunk-level retry capabilities
- **Storage Efficiency**: Better management of audio files and metadata

This system transforms LeepiAI into a professional-grade recording platform that can handle complex, multi-segment recording sessions with enterprise-level reliability. 