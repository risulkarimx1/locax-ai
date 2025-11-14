export async function detectGitBranch(
  folderHandle: FileSystemDirectoryHandle
): Promise<string | null> {
  try {
    // Try to access .git folder
    const gitFolder = await folderHandle.getDirectoryHandle('.git', { create: false });
    
    // Read HEAD file
    const headFile = await gitFolder.getFileHandle('HEAD');
    const file = await headFile.getFile();
    const content = await file.text();
    
    // Parse branch name from HEAD
    // Format: "ref: refs/heads/main"
    const match = content.match(/ref: refs\/heads\/(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
    
    return null;
  } catch (error) {
    // No git folder or can't read it
    return null;
  }
}
