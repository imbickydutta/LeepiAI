# Recordings Management System

## Overview

The LeepiAI application now includes a comprehensive recordings management system that separates audio recordings from transcripts, providing better error handling, retry functionality, and audio file management.

## Key Features

### 1. **Separate Recordings and Transcripts**
- Audio recordings are now stored independently from transcripts
- Failed uploads are preserved for retry attempts
- Audio files can be managed separately from transcript content

### 2. **Enhanced Error Handling**
- Failed uploads are automatically saved with error details
- Users can see exactly what went wrong during processing
- No more lost recordings due to upload failures

### 3. **Retry Functionality**
- Failed recordings can be retried with a single click
- Automatic retry count tracking
- Preserves original audio files for retry attempts

### 4. **Audio File Management**
- Delete audio files while keeping transcripts
- Complete recording deletion (including transcript)
- Storage optimization and cleanup

### 5. **Dual Tab Interface**
- **Transcripts Tab**: View and manage generated transcripts
- **Recordings Tab**: View and manage all audio recordings

## User Interface

### Recordings Tab
The Recordings tab shows all recordings with their current status:

- **Completed**: Successfully processed with transcript generated
- **Failed**: Upload or processing failed (can be retried)
- **Processing**: Currently being processed
- **Pending**: Waiting to be processed

### Recording Details
Each recording shows:
- Audio file information (size, type, count)
- Transcript status (available/not available)
- Error details (if failed)
- Retry count and last retry timestamp
- Creation and completion dates

### Actions Available
- **Retry**: Retry failed recordings
- **Delete Audio Files**: Remove audio files while keeping transcript
- **Delete Recording**: Complete removal of recording and transcript

## Backend Architecture

### New Models
- **Recording Model**: Stores recording metadata and audio file information
- **AudioFile Schema**: Tracks individual audio files with metadata

### New API Endpoints
```
GET    /api/recordings              # Get user's recordings
GET    /api/recordings/:id          # Get specific recording
POST   /api/recordings/:id/retry    # Retry failed recording
DELETE /api/recordings/:id/audio    # Delete audio files only
DELETE /api/recordings/:id          # Delete entire recording
```

### Database Schema
```javascript
{
  userId: ObjectId,           // User who owns the recording
  title: String,              // Recording title
  status: String,             // pending|processing|completed|failed
  audioFiles: [AudioFile],    // Array of audio file objects
  transcriptId: ObjectId,     // Reference to transcript (if exists)
  metadata: Object,           // Duration, file size, etc.
  error: String,              // Error message (if failed)
  retryCount: Number,         // Number of retry attempts
  lastRetryAt: Date,          // Last retry timestamp
  completedAt: Date,          // Completion timestamp
  audioDeletedAt: Date        // Audio deletion timestamp
}
```

## Error Handling Flow

### 1. **Upload Failure**
```
Recording starts → Processing fails → Recording saved as "failed" → User sees error
```

### 2. **Retry Process**
```
User clicks retry → Status changes to "processing" → Audio reprocessed → 
Success: Recording marked "completed" + transcript generated
Failure: Recording marked "failed" + error updated
```

### 3. **File Management**
```
User deletes audio files → Audio files removed from storage → 
Recording updated → Transcript preserved (if exists)
```

## Benefits

### For Users
- **No Lost Recordings**: Failed uploads are preserved
- **Easy Recovery**: One-click retry for failed uploads
- **Better Control**: Manage audio files independently
- **Clear Status**: Always know what's happening with recordings

### For System
- **Better Reliability**: Failed uploads can be recovered
- **Storage Optimization**: Audio files can be cleaned up
- **Audit Trail**: Complete history of all recording attempts
- **Performance**: Separate management of audio and text data

## Usage Examples

### Retry a Failed Recording
1. Go to the **Recordings** tab
2. Find the failed recording (red status)
3. Click **Retry Upload**
4. Wait for processing to complete
5. Check status for success/failure

### Clean Up Storage
1. Go to the **Recordings** tab
2. Find completed recordings with large audio files
3. Click **Delete Audio Files** to free up space
4. Transcript remains available for reference

### Complete Cleanup
1. Go to the **Recordings** tab
2. Find recordings you no longer need
3. Click **Delete Recording** to remove everything
4. Both audio files and transcript are permanently deleted

## Technical Implementation

### Frontend Components
- `RecordingsManager`: Main recordings management interface
- Enhanced `MainInterface`: Dual tab system
- Updated `ApiService`: New recording management methods

### Backend Services
- `DatabaseService`: Recording CRUD operations
- `AudioService`: Audio file management
- New recording routes and models

### Data Flow
```
Frontend → API → DatabaseService → Recording Model
                ↓
            AudioService → File System
```

## Future Enhancements

### Planned Features
- **Batch Operations**: Retry/delete multiple recordings
- **Storage Analytics**: Show storage usage and recommendations
- **Auto-cleanup**: Automatic cleanup of old audio files
- **Export Options**: Export recording metadata and statistics

### Performance Optimizations
- **Lazy Loading**: Load recordings on demand
- **Caching**: Cache frequently accessed recording data
- **Background Processing**: Process retries in background

## Troubleshooting

### Common Issues
1. **Retry Fails Again**: Check error details for specific issues
2. **Audio Files Missing**: Files may have been deleted manually
3. **Storage Full**: Delete old audio files to free space

### Debug Information
- Check browser console for error details
- Review backend logs for processing errors
- Verify audio file permissions and storage

## Conclusion

The new recordings management system provides a robust foundation for handling audio uploads and processing failures. Users can now confidently record interviews knowing that failed uploads can be recovered, and system administrators can better manage storage and performance.

This system transforms LeepiAI from a simple recording tool into a professional-grade interview management platform with enterprise-level reliability and user experience. 