Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Flags]
public enum FOS : uint {
    FOS_OVERWRITEPROMPT = 0x2, FOS_STRICTFILETYPES = 0x4, FOS_NOCHANGEDIR = 0x8, FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_ALLNONSTORAGEITEMS = 0x80, FOS_NOVALIDATE = 0x100, FOS_ALLOWMULTISELECT = 0x200, FOS_PATHMUSTEXIST = 0x800, FOS_FILEMUSTEXIST = 0x1000, FOS_CREATEPROMPT = 0x2000, FOS_SHAREAWARE = 0x4000, FOS_NOREADONLYRETURN = 0x8000, FOS_NOTESTFILECREATE = 0x10000, FOS_HIDEMRUPLACES = 0x20000, FOS_HIDEPINNEDPLACES = 0x40000, FOS_NODEREFERENCELINKS = 0x100000, FOS_DONTADDTORECENT = 0x2000000 // and more
}
public enum SIGDN : uint {
    SIGDN_FILESYSPATH = 0x80058000
}
[ComImport]
[Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileDialog {
    [PreserveSig]
    int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde);
    void Unadvise(uint dwCookie);
    void SetOptions(FOS fos);
    void GetOptions(out FOS pfos);
    void SetDefaultFolder(IntPtr psi);
    void SetFolder(IntPtr psi);
    void GetFolder(out IntPtr ppsi);
    void GetCurrentSelection(out IntPtr ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName(out IntPtr pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    // and more
}
[ComImport]
[Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
class FileOpenDialogClass {
}
[ComImport]
[Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(SIGDN sigdnName, out IntPtr ppszName);
    // and more
}
public class FolderPicker {
    public static string ShowDialog() {
        IFileDialog dialog = (IFileDialog)new FileOpenDialogClass();
        dialog.SetOptions(FOS.FOS_PICKFOLDERS | FOS.FOS_FORCEFILESYSTEM);
        if(dialog.Show(IntPtr.Zero) != 0) return null;
        IShellItem item;
        dialog.GetResult(out item);
        if(item == null) return null;
        IntPtr pszName;
        item.GetDisplayName(SIGDN.SIGDN_FILESYSPATH, out pszName);
        return Marshal.PtrToStringUni(pszName);
    }
}
"@ -ReferencedAssemblies System.Runtime.InteropServices
[string]$selectedFolder = [FolderPicker]::ShowDialog()
Write-Output $selectedFolder
