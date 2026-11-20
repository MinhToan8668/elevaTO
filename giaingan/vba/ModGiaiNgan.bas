Attribute VB_Name = "ModGiaiNgan"
'==========================================================================
'  TOOL SOAN HO SO GIAI NGAN VIB  -  ban 6.0 (doanh so UBG theo goi)
'  KUNN . To trinh phe duyet giai ngan . UNC . Bang ke chung tu
'
'  Ho tro:
'    - Nhieu ben thu huong tren 1 KUNN (sheet THU_HUONG) -> moi ben 1 UNC
'    - Khoi TSBD nhieu dong, khac nhau theo tung KH (sheet TSBD)
'    - Dieu kien tin dung nhieu dong (sheet DIEU_KIEN)
'    - Bang ke chung tu day du cot (sheet HOA_DON)
'==========================================================================
Option Explicit

Private Const TU_LE As String = "linh"      ' doi thanh "le" neu don vi dung "le"
Private Const DUNG_TU As Boolean = True     ' True = "hai muoi tu" ; False = "hai muoi bon"

Public Const PHIEN_BAN As String = "6.0 - doanh so UBG theo GOI, so khe uoc theo thu tu  (22/10/2026)"

Private Const S_GN As String = "GIAI_NGAN"
Private Const S_DM As String = "DANH_MUC"
Private Const S_HD As String = "HOA_DON"
Private Const S_TH As String = "THU_HUONG"
Private Const S_TS As String = "TSBD"
Private Const S_DK As String = "DIEU_KIEN"
Private Const S_UB As String = "UBG"
Private Const S_KU As String = "KHE_UOC"
Private Const S_LS As String = "LICH_SU"

Private Const HD_R1 As Long = 5,  HD_R2 As Long = 1004   ' vung bang ke (sheet HOA_DON) - toi da 1000 hoa don
Private Const KU_R1 As Long = 5,  KU_R2 As Long = 499    ' vung so KHE_UOC
' Nhom co nhieu hon ngan nay dong thi KHONG gop o doc cot ten nha cung cap,
' ma lap lai ten tren tung dong - neu khong, sang trang moi cot ten se trong.
Private Const GOP_TOI_DA As Long = 25
Private Const TH_R1 As Long = 5,  TH_R2 As Long = 24     ' vung ben thu huong
Private Const TS_R1 As Long = 5,  TS_R2 As Long = 64     ' vung TSBD
Private Const DK_R1 As Long = 5,  DK_R2 As Long = 34     ' vung dieu kien tin dung
Private Const UB_R1 As Long = 5,  UB_R2 As Long = 24     ' vung sheet UBG
Private Const CHK_R1 As Long = 53, CHK_R2 As Long = 65   ' vung checklist (dong 53 = kiem tra ban module)

Private gStage As String

' Ban so cua module - o C53 sheet GIAI_NGAN goi ham nay de chac chan module da duoc import dung ban
Public Function PhienBanSo() As Double
    PhienBanSo = 6
End Function

'==========================================================================
' 1. DOC SO TIEN BANG CHU
'==========================================================================
Public Function DocSoTien(ByVal Amount As Variant) As String
    Dim n As Double, s As String
    If Not IsNumeric(Amount) Then DocSoTien = "": Exit Function
    n = CDbl(Amount)
    If n = 0 Then DocSoTien = "Kh" & ChrW(&H00F4) & "ng " & ChrW(&H0111) & ChrW(&H1ED3) & "ng": Exit Function
    s = DocSo(n) & " " & ChrW(&H0111) & ChrW(&H1ED3) & "ng"
    s = Trim(Replace(s, "  ", " "))
    DocSoTien = UCase(Left(s, 1)) & Mid(s, 2)
End Function

Private Function DocSo(ByVal n As Double) As String
    Dim g(1 To 5) As Long, i As Long, cnt As Long, s As String, txt As String
    Dim donVi As Variant
    donVi = Array("", "ngh" & ChrW(&H00EC) & "n", "tri" & ChrW(&H1EC7) & "u", "t" & ChrW(&H1EF7), "ngh" & ChrW(&H00EC) & "n t" & ChrW(&H1EF7))
    cnt = 0
    Do While n > 0
        cnt = cnt + 1
        g(cnt) = CLng(n - Int(n / 1000) * 1000)
        n = Int(n / 1000)
    Loop
    s = ""
    For i = cnt To 1 Step -1
        txt = Doc3So(g(i), (i = cnt))
        If Len(txt) > 0 Then s = s & txt & " " & donVi(i - 1) & " "
    Next i
    DocSo = Trim(s)
End Function

Private Function Doc3So(ByVal x As Long, ByVal laNhomDau As Boolean) As String
    Dim tr As Long, ch As Long, dv As Long, s As String
    Dim so As Variant
    so = Array("kh" & ChrW(&H00F4) & "ng", "m" & ChrW(&H1ED9) & "t", "hai", "ba", "b" & ChrW(&H1ED1) & "n", "n" & ChrW(&H0103) & "m", "s" & ChrW(&H00E1) & "u", "b" & ChrW(&H1EA3) & "y", "t" & ChrW(&H00E1) & "m", "ch" & ChrW(&H00ED) & "n")
    If x = 0 Then Doc3So = "": Exit Function
    tr = x \ 100: ch = (x \ 10) Mod 10: dv = x Mod 10
    If tr > 0 Then
        s = so(tr) & " tr" & ChrW(&H0103) & "m"
    ElseIf Not laNhomDau Then
        s = "kh" & ChrW(&H00F4) & "ng tr" & ChrW(&H0103) & "m"
    End If
    If ch > 1 Then
        s = s & " " & so(ch) & " m" & ChrW(&H01B0) & ChrW(&H01A1) & "i"
        If dv = 1 Then
            s = s & " m" & ChrW(&H1ED1) & "t"
        ElseIf dv = 4 Then
            s = s & IIf(DUNG_TU, " t" & ChrW(&H01B0), " b" & ChrW(&H1ED1) & "n")
        ElseIf dv = 5 Then
            s = s & " l" & ChrW(&H0103) & "m"
        ElseIf dv > 0 Then
            s = s & " " & so(dv)
        End If
    ElseIf ch = 1 Then
        s = s & " m" & ChrW(&H01B0) & ChrW(&H1EDD) & "i"
        If dv = 5 Then
            s = s & " l" & ChrW(&H0103) & "m"
        ElseIf dv > 0 Then
            s = s & " " & so(dv)
        End If
    Else
        If dv > 0 Then
            If Len(s) > 0 Then s = s & " " & TU_LE
            s = s & " " & so(dv)
        End If
    End If
    Doc3So = Trim(s)
End Function

'==========================================================================
' 2. XUAT HO SO
'==========================================================================
' Chay macro nay de biet chac module dang chay la ban nao
Public Sub PhienBan()
    MsgBox "Module ModGiaiNgan dang chay: ban " & PHIEN_BAN & vbCrLf & vbCrLf & _
           "Cac macro chinh:" & vbCrLf & _
           "  XuatHoSoGiaiNgan     xuat du bo KUNN + To trinh + Bang ke" & vbCrLf & _
           "  Xuat_KUNN            chi xuat lai khe uoc" & vbCrLf & _
           "  Xuat_ToTrinh         chi xuat lai to trinh" & vbCrLf & _
           "  Xuat_BangKe          chi xuat lai bang ke chung tu (Word)" & vbCrLf & _
                  "  MoKhoaSoKUNN         mo khoa so KUNN" & vbCrLf & _
                  "  SapXepSoKheUoc       sap xep lai so KHE_UOC (han muc -> ngay GN)" & vbCrLf & _
                  "  TaoNutBam            tao nut bam tren GIAI_NGAN va BAT_DAU" & vbCrLf & _
                  "  TraLaiCongThucTheoGoi tra lai cong thuc C8/C9/C10/C35 theo goi" & vbCrLf & _
                  "  SapXepDanhBa         gom cac tai khoan cung mot ben thu huong" & vbCrLf & _
                  "  KiemTraMoiTruong     kiem tra khi tool khong xuat duoc file" & vbCrLf & _
           "  XoaDuLieuDotGiaiNgan bat dau dot giai ngan moi" & vbCrLf & _
           "  LamMoi               tinh lai cong thuc va canh bao", _
           vbInformation, "Phien ban module"
End Sub

Public Sub XuatHoSoGiaiNgan()
    Call ChayXuat("KTB", "day du: KUNN + To trinh + Bang ke")
End Sub

Public Sub Xuat_KUNN()
    Call ChayXuat("K", "chi KUNN")
End Sub

Public Sub Xuat_ToTrinh()
    Call ChayXuat("T", "chi To trinh")
End Sub

' UNC thuong do khach hang tu gui len ngan hang nen KHONG nam trong bo xuat day du.
' Giu lai macro nay phong khi can soan ho UNC cho khach.
Public Sub Xuat_UNC_neu_can()
    Call ChayXuat("U", "chi UNC (tuy chon)")
End Sub

Public Sub Xuat_BangKe()
    Call ChayXuat("B", "chi Bang ke chung tu")
End Sub

'--------------------------------------------------------------------------
' flags: K = KUNN, T = To trinh, U = UNC, B = Bang ke PDF
'--------------------------------------------------------------------------
Private Sub ChayXuat(ByVal flags As String, ByVal moTa As String)
    Dim wsG As Worksheet, wsD As Worksheet, wsT As Worksheet
    Dim tpl As String, outDir As String, soKUNN As String, base As String
    Dim d As Object, wdApp As Object
    Dim canhBao As String, c As Range
    Dim i As Long, nTH As Long, ghiChu As String, daTao As String
    Dim fK As String, fT As String, fB As String, daCo As String, fu As String

    On Error GoTo LOI

    gStage = "Doc du lieu tu cac sheet"
    Set wsG = ThisWorkbook.Sheets(S_GN)
    Set wsD = ThisWorkbook.Sheets(S_DM)
    Set wsT = ThisWorkbook.Sheets(S_TH)
    Application.Calculate

    ' Checklist chi kiem khi xuat KUNN hoac xuat day du
    If InStr(flags, "K") > 0 Then
        gStage = "Kiem tra checklist"
        For Each c In wsG.Range("C" & CHK_R1 & ":C" & CHK_R2)
            If Left(CStr(c.Value), 1) = ChrW(10008) Then canhBao = canhBao & vbCrLf & "  - " & BoDau(CStr(c.Value))
        Next c
        If Len(canhBao) > 0 Then
            If MsgBox("HO SO CHUA DAT CAC DIEU KIEN SAU:" & vbCrLf & canhBao & vbCrLf & vbCrLf & _
                      "Van tiep tuc xuat file?", vbExclamation + vbYesNo, "Kiem tra truoc khi xuat") = vbNo Then Exit Sub
        End If
    End If

    ' --- bang ke: co dong nao nam ngoai vung khong? ---
    gStage = "Kiem tra vung bang ke"
    Dim nHD As Long, nNgoai As Long
    nHD = DemDong(ThisWorkbook.Sheets(S_HD), 2, HD_R1, HD_R2)
    nNgoai = DemDongNgoaiVung(ThisWorkbook.Sheets(S_HD), 2, HD_R2)
    If nNgoai > 0 Then
        MsgBox "Sheet HOA_DON con " & nNgoai & " dong nam NGOAI vung bang ke" & vbCrLf & _
               "(vung cho phep la dong " & HD_R1 & " den dong " & HD_R2 & ")." & vbCrLf & vbCrLf & _
               "Neu xuat bay gio se THIEU dung " & nNgoai & " dong do." & vbCrLf & vbCrLf & _
               "Cach xu ly: don du lieu len cho vua trong vung, hoac bao de noi rong them vung.", _
               vbCritical, "Bang ke vuot qua vung cho phep"
        Exit Sub
    End If
    If nHD > 400 Then
        If MsgBox("Bang ke co " & nHD & " hoa don." & vbCrLf & vbCrLf & _
                  "Word phai chen tung dong nen se mat mot luc (co the vai phut)." & vbCrLf & _
                  "Trong luc do dung tat Word hay Excel." & vbCrLf & vbCrLf & "Tiep tuc?", _
                  vbQuestion + vbYesNo, "Bang ke rat dai") = vbNo Then Exit Sub
    End If

    ' --- file dang mo che do chi doc thi khong ghi so khe uoc duoc ---
    gStage = "Kiem tra quyen ghi file Excel"
    If ThisWorkbook.ReadOnly Then
        MsgBox "File Excel dang mo o che do CHI DOC (Read-Only) nen khong ghi duoc" & vbCrLf & _
               "dong khe uoc vao so." & vbCrLf & vbCrLf & _
               "Thuong gap khi file nam tren o mang dung chung va MOT NGUOI KHAC" & vbCrLf & _
               "dang mo file do. Excel khong cho hai nguoi cung ghi mot luc." & vbCrLf & vbCrLf & _
               "Cach xu ly:" & vbCrLf & _
               "  - Hoi xem ai dang mo file va nho ho dong lai, roi mo lai file; hoac" & vbCrLf & _
               "  - Bam File -> Save As luu mot ban rieng ve may minh de xuat.", _
               vbExclamation, "File dang o che do chi doc"
        Exit Sub
    End If

    gStage = "Lay so KUNN"
    soKUNN = CStr(wsG.Range("C37").Value)
    If Len(Trim(soKUNN)) = 0 Then MsgBox "Chua co so KUNN o o C37.", vbCritical: Exit Sub

    gStage = "Kiem tra thu muc Template / Output"
    tpl = ThisWorkbook.Path & Application.PathSeparator & "Template" & Application.PathSeparator
    outDir = ThisWorkbook.Path & Application.PathSeparator & "Output" & Application.PathSeparator
    TaoThuMuc outDir
    If Not CoThuMuc(tpl) Then
        MsgBox "Khong tim thay thu muc Template ben canh file Excel." & vbCrLf & vbCrLf & BoDau(tpl) & vbCrLf & vbCrLf & _
               "Dua file Excel ve dung thu muc goc (canh Template va Output) roi chay lai.", vbCritical
        Exit Sub
    End If

    base = outDir & Replace(Replace(soKUNN, "/", "-"), "\", "-")
    fK = base & " - 1. KUNN.docx"
    fT = base & " - 2. To trinh giai ngan.docx"
    fB = base & " - 3. Bang ke chung tu.docx"

    nTH = DemDong(wsT, 2, TH_R1, TH_R2)
    If nTH < 1 Then nTH = 1

    ' --- kiem tra file dich co dang bi mo trong Word khong ---
    gStage = "Kiem tra file dang mo"
    Dim dangMo As String
    If InStr(flags, "K") > 0 Then If FileDangMo(fK) Then dangMo = dangMo & vbCrLf & "  - " & BoDau(TenFile(fK))
    If InStr(flags, "T") > 0 Then If FileDangMo(fT) Then dangMo = dangMo & vbCrLf & "  - " & BoDau(TenFile(fT))
    If InStr(flags, "B") > 0 Then If FileDangMo(fB) Then dangMo = dangMo & vbCrLf & "  - " & BoDau(TenFile(fB))
    If InStr(flags, "U") > 0 Then
        For i = 1 To nTH
            fu = TenFileUNC(base, wsT, i, nTH)
            If FileDangMo(fu) Then dangMo = dangMo & vbCrLf & "  - " & BoDau(TenFile(fu))
        Next i
    End If
    If Len(dangMo) > 0 Then
        MsgBox "Cac file sau DANG MO nen khong ghi de duoc:" & vbCrLf & dangMo & vbCrLf & vbCrLf & _
               "Dong cac file do trong Word / Adobe Reader roi chay lai.", vbExclamation, "File dang mo"
        Exit Sub
    End If

    ' --- canh bao ghi de ---
    gStage = "Kiem tra file da ton tai"
    If InStr(flags, "K") > 0 And CoFile(fK) Then daCo = daCo & vbCrLf & "  - " & BoDau(TenFile(fK))
    If InStr(flags, "T") > 0 And CoFile(fT) Then daCo = daCo & vbCrLf & "  - " & BoDau(TenFile(fT))
    If InStr(flags, "B") > 0 And CoFile(fB) Then daCo = daCo & vbCrLf & "  - " & BoDau(TenFile(fB))
    If InStr(flags, "U") > 0 Then
        For i = 1 To nTH
            fu = TenFileUNC(base, wsT, i, nTH)
            If CoFile(fu) Then daCo = daCo & vbCrLf & "  - " & BoDau(TenFile(fu))
        Next i
    End If
    If Len(daCo) > 0 Then
        If MsgBox("Cac file sau da co trong thu muc Output va SE BI GHI DE:" & vbCrLf & daCo & vbCrLf & vbCrLf & _
                  "Tiep tuc?", vbExclamation + vbYesNo, "Ghi de file cu") = vbNo Then Exit Sub
    End If

    gStage = "Nap du lieu vao bang token"
    Set d = CreateObject("Scripting.Dictionary")
    Call NapToken(d, wsG, wsD)

    If InStr(flags, "K") > 0 Or InStr(flags, "T") > 0 Or _
       InStr(flags, "U") > 0 Or InStr(flags, "B") > 0 Then
        gStage = "Khoi dong Microsoft Word"
        Set wdApp = CreateObject("Word.Application")
        wdApp.Visible = False
        wdApp.DisplayAlerts = 0
        On Error Resume Next
        wdApp.ScreenUpdating = False      ' nhanh hon nhieu khi bang ke co hang tram dong
        On Error GoTo LOI
    End If

    If InStr(flags, "K") > 0 Then
        gStage = "Tao file 1 - KUNN"
        Call TaoKUNN(wdApp, tpl & DM(wsD, "FILE_KUNN"), fK, d)
        daTao = daTao & vbCrLf & "  1. KUNN"
    End If

    If InStr(flags, "T") > 0 Then
        gStage = "Tao file 2 - To trinh giai ngan"
        Call TaoToTrinh(wdApp, tpl & DM(wsD, "FILE_PDGN"), fT, d)
        daTao = daTao & vbCrLf & "  2. To trinh giai ngan"
    End If

    If InStr(flags, "U") > 0 Then
        For i = 1 To nTH
            gStage = "Tao file 3 - UNC so " & i
            Call TaoUNC(wdApp, tpl & DM(wsD, "FILE_UNC"), TenFileUNC(base, wsT, i, nTH), d, wsT, TH_R1 + i - 1)
        Next i
        daTao = daTao & vbCrLf & "  4. UNC (" & nTH & " file)"
    End If

    If InStr(flags, "B") > 0 Then
        gStage = "Tao file 3 - Bang ke chung tu (Word)"
        Call TaoBangKe(wdApp, tpl & DM(wsD, "FILE_BANGKE"), fB, d)
        daTao = daTao & vbCrLf & "  3. Bang ke chung tu (Word)"
    End If

    If Not wdApp Is Nothing Then
        gStage = "Dong Word"
        On Error Resume Next
        wdApp.ScreenUpdating = True
        On Error GoTo LOI
        wdApp.Quit
        Set wdApp = Nothing
    End If

    ' --- khoa so KUNN de lan xuat sau khong bi nhay so ---
    gStage = "Khoa so KUNN"
    Call KhoaSoKUNN(wsG)

    If InStr(flags, "K") > 0 Then
        gStage = "Ghi so KHE_UOC"
        Call GhiSoKheUoc
    End If

    gStage = "Ghi nhat ky LICH_SU"
    Call GhiLichSu(base & "   [" & moTa & "]")

    gStage = ""
    MsgBox "DA XUAT XONG - " & moTa & vbCrLf & vbCrLf & _
           "So KUNN: " & BoDau(soKUNN) & BoDau(daTao) & vbCrLf & vbCrLf & _
           "Thu muc: " & BoDau(outDir) & vbCrLf & vbCrLf & _
           "So KUNN dang duoc KHOA o o C33 nen xuat lai bao nhieu lan cung giu nguyen so." & vbCrLf & _
           "Sang khe uoc moi: Alt+F8 -> MoKhoaSoKUNN." & _
           IIf(Len(ghiChu) > 0, vbCrLf & vbCrLf & BoDau(ghiChu), ""), _
           vbInformation, "Hoan tat"
    Exit Sub

LOI:
    Dim eN As Long, eD As String, eS As String, msg As String
    eN = Err.Number: eD = Err.Description: eS = gStage
    On Error Resume Next
    Application.StatusBar = False
    If Not wdApp Is Nothing Then
        wdApp.DisplayAlerts = 0
        wdApp.Quit 0
    End If
    Set wdApp = Nothing
    Application.EnableEvents = True
    On Error GoTo 0
    msg = "Khong xuat duoc ho so." & vbCrLf & vbCrLf & _
          "Buoc dang chay : " & eS & vbCrLf & _
          "Ma loi         : " & eN & vbCrLf & _
          "Mo ta          : " & BoDau(eD)
    If eN = 5174 Or eN = 4198 Or eN = 91 Or eN = 5941 Then
        msg = msg & vbCrLf & vbCrLf & _
              "Nguyen nhan thuong gap: file .docx trong thu muc Template bi Windows chan" & vbCrLf & _
              "(vi tai tu mang ve). Cach xu ly: mo thu muc Template, chuot phai tung file" & vbCrLf & _
              ".docx -> Properties -> o duoi cung tick Unblock -> OK. Lam du cac file roi chay lai."
    End If
    MsgBox msg, vbCritical, "Xuat ho so that bai"
End Sub

' Kiem tra mot file co dang bi chuong trinh khac mo (khoa) hay khong.
' Dung FSO de chay duoc voi duong dan co dau / o mang.
Private Function FileDangMo(ByVal p As String) As Boolean
    Dim ts As Object, own As String
    If Len(p) = 0 Then Exit Function
    If Not CoFile(p) Then Exit Function

    ' Word tao file tam "~$ten.docx" ben canh khi dang mo file do
    On Error Resume Next
    own = FSO.GetParentFolderName(p) & "\~$" & FSO.GetFileName(p)
    On Error GoTo 0
    If CoFile(own) Then FileDangMo = True: Exit Function

    On Error Resume Next
    Err.Clear
    Set ts = FSO.OpenTextFile(p, 8, False)      ' 8 = ForAppending, khong ghi gi
    If Err.Number <> 0 Then
        Err.Clear
        FileDangMo = True
    Else
        ts.Close
    End If
    On Error GoTo 0
End Function

Private Function TenFileUNC(base As String, wsT As Worksheet, i As Long, nTH As Long) As String
    If nTH > 1 Then
        TenFileUNC = base & " - 3. UNC (" & i & ") " & LamSachTen(CStr(wsT.Cells(TH_R1 + i - 1, 2).Value)) & ".docx"
    Else
        TenFileUNC = base & " - 3. UNC.docx"
    End If
End Function

' Ghi so thu tu dang dung vao o C33 -> tu lan sau so KUNN khong nhay nua
Private Sub KhoaSoKUNN(wsG As Worksheet)
    Dim s As String, i As Long, j As Long, n As String
    If Len(Trim(CStr(wsG.Range("C33").Value))) > 0 Then Exit Sub
    s = CStr(wsG.Range("C37").Value)
    i = InStr(s, "(")
    j = InStr(s, ")")
    If i > 0 And j > i Then
        n = Mid(s, i + 1, j - i - 1)
        If IsNumeric(n) Then
            Application.EnableEvents = False
            wsG.Range("C33").Value = CLng(n)
            Application.EnableEvents = True
            Application.Calculate
        End If
    End If
End Sub

Public Sub MoKhoaSoKUNN()
    Dim wsG As Worksheet
    Set wsG = ThisWorkbook.Sheets(S_GN)
    If Len(Trim(CStr(wsG.Range("C33").Value))) = 0 Then
        MsgBox "So KUNN dang o che do tu danh so, khong bi khoa." & vbCrLf & vbCrLf & _
               "So se dung cho lan giai ngan toi: " & BoDau(CStr(wsG.Range("C37").Value)), vbInformation
        Exit Sub
    End If
    If MsgBox("Dang khoa o so " & wsG.Range("C33").Value & " (" & BoDau(CStr(wsG.Range("C37").Value)) & ")." & vbCrLf & vbCrLf & _
              "Mo khoa de sang KHE UOC MOI?" & vbCrLf & _
              "Sau khi mo khoa, so KUNN se tu nhay sang so tiep theo.", _
              vbQuestion + vbYesNo, "Mo khoa so KUNN") = vbNo Then Exit Sub
    Application.EnableEvents = False
    wsG.Range("C33").ClearContents
    Application.EnableEvents = True
    Application.Calculate
    MsgBox "Da mo khoa. So KUNN cho lan toi: " & BoDau(CStr(wsG.Range("C37").Value)), vbInformation
End Sub

'--------------------------------------------------------------------------
Private Sub NapToken(d As Object, wsG As Worksheet, wsD As Worksheet)
    Dim duNoTruoc As Double, hm1 As Double, hm2 As Double, thuNo As Double

    duNoTruoc = Nz(wsG.Range("C13").Value)
    thuNo = Nz(wsG.Range("C14").Value)
    hm1 = Nz(DM(wsD, "HM1")): hm2 = Nz(DM(wsD, "HM2"))

    ' --- thong tin co dinh cua khach hang ---
    d("TEN_KH") = DM(wsD, "TEN_KH")
    d("TEN_KH_NGAN") = DM(wsD, "TEN_KH_NGAN")
    d("CIF") = DM(wsD, "CIF")
    d("GCN_DKKD") = DM(wsD, "GCN_DKKD")
    d("DIA_CHI_KH") = DM(wsD, "DIA_CHI_KH")
    d("TINH_TP_KH") = DM(wsD, "TINH_TP_KH")
    d("NGUOI_DAI_DIEN") = DM(wsD, "NGUOI_DAI_DIEN")
    d("CHUC_DANH") = DM(wsD, "CHUC_DANH")
    d("BEN_BAO_LANH") = DM(wsD, "BEN_BAO_LANH")
    d("SO_HDTD") = DM(wsD, "SO_HDTD")
    d("NGAY_HDTD") = FDate(DM(wsD, "NGAY_HDTD"))
    d("NGAY_HET_HAN_HM") = FDate(DM(wsD, "NGAY_HET_HAN_HM"))
    d("SO_PDTD") = DM(wsD, "SO_PDTD")
    d("NGAY_PDTD") = FDate(DM(wsD, "NGAY_PDTD"))
    d("TEN_TTKD") = DM(wsD, "TEN_TTKD")
    d("MA_TTKD") = DM(wsD, "MA_TTKD")
    d("TEN_QLKH") = DM(wsD, "TEN_QLKH")
    d("MA_QLKH") = DM(wsD, "MA_QLKH")
    d("PROFIT_CENTER") = DM(wsD, "PROFIT_CENTER")
    d("TK_GHI_CO") = DM(wsD, "TK_GHI_CO")
    d("TEN_TK_GHI_CO") = DM(wsD, "TEN_TK_GHI_CO")
    d("TK_THU_NO") = DM(wsD, "TK_THU_NO")
    d("TK_TRICH_NO") = DM(wsD, "TK_TRICH_NO")
    d("LOAN_SUB_TYPE") = DM(wsD, "LOAN_SUB_TYPE")
    d("MA_TT41") = DM(wsD, "MA_TT41")
    d("MA_ANALYSIS") = DM(wsD, "MA_ANALYSIS")
    d("MA_INFOR") = DM(wsD, "MA_INFOR")
    d("MA_LAI_SUAT") = DM(wsD, "MA_LAI_SUAT")
    d("LOAI_TIEN") = DM(wsD, "LOAI_TIEN")
    d("LOAI_TIEN_UNC") = "VND"
    d("MUC_DICH_KUNN") = DM(wsD, "MUC_DICH_KUNN")
    d("MUC_DICH_CHO_VAY") = DM(wsD, "MUC_DICH_CHO_VAY")
    d("SAN_PHAM") = DM(wsD, "SAN_PHAM")
    d("NGAY_TRA_LAI") = CStr(DM(wsD, "NGAY_TRA_LAI"))

    ' --- so lieu dot giai ngan ---
    d("SO_KUNN") = wsG.Range("C37").Value
    d("NGAY_GN") = FDate(wsG.Range("C6").Value)
    If IsDate(wsG.Range("C6").Value) Then
        d("NGAY_GN_VN") = "Ng" & ChrW(&H00E0) & "y " & Format(wsG.Range("C6").Value, "dd") & _
                          " th" & ChrW(&H00E1) & "ng " & Format(wsG.Range("C6").Value, "mm") & _
                          " n" & ChrW(&H0103) & "m " & Format(wsG.Range("C6").Value, "yyyy")
    Else
        d("NGAY_GN_VN") = ""
    End If
    d("NGAY_SO_DU") = FDate(wsG.Range("C6").Value)
    d("NGAY_DAO_HAN") = FDate(wsG.Range("C9").Value)
    d("SO_NGAY_VAY") = Format(Nz(wsG.Range("C8").Value), "0")
    d("SO_TIEN") = Format(Nz(wsG.Range("C7").Value), "#,##0")
    d("SO_TIEN_CHU") = DocSoTien(wsG.Range("C7").Value)
    d("SO_TIEN_CHU_UNC") = DocSoTien(wsG.Range("C7").Value)
    d("TONG_DU_NO") = Format(Nz(wsG.Range("C39").Value), "#,##0")
    d("TONG_DU_NO_CHU") = DocSoTien(wsG.Range("C39").Value)
    d("LAI_SUAT") = Format(Nz(wsG.Range("C10").Value) * 100, "0.00")
    d("NGAY_TRA_LAI_DAU") = FDate(wsG.Range("C41").Value)
    d("NGAY_CIC") = FDate(wsG.Range("C11").Value)
    d("NGAY_GDBD") = FDate(wsG.Range("C12").Value)
    d("TESTKEY") = CStr(wsG.Range("C42").Value)
    d("TESTKEY_UNC") = CStr(wsG.Range("C32").Value)
    d("GOI_UBG") = CStr(wsG.Range("C16").Value)          ' ten goi / UBG cua dot nay (ban 6.0)
    d("SO_UBG") = CStr(wsG.Range("C17").Value)
    d("NGAY_UBG") = FDate(wsG.Range("C18").Value)
    d("UBG_TONG_MUC") = Format(Nz(wsG.Range("C19").Value), "#,##0")
    d("UBG_HIEU_LUC") = FDate(wsG.Range("C20").Value)
    d("GN_LUY_KE_TR") = Format(Nz(wsG.Range("C51").Value), "#,##0")
    d("FTP_KY_HAN") = CStr(wsG.Range("C21").Value)
    d("FTP") = Format(Nz(wsG.Range("C22").Value) * 100, "0.00")
    d("BIEU_LAI_SUAT") = CStr(wsG.Range("C23").Value)
    d("GHI_CHU_LAI_SUAT") = "Gi" & ChrW(&H1EA3) & "i ng" & ChrW(&H00E2) & "n theo FTP th" & ChrW(&H00F4) & "ng th" & ChrW(&H01B0) & ChrW(&H1EDD) & "ng, k" & ChrW(&H1EF3) & " h" & ChrW(&H1EA1) & "n " & CStr(wsG.Range("C21").Value) & _
                            " l" & ChrW(&H00E0) & " " & Format(Nz(wsG.Range("C22").Value) * 100, "0.00") & "%/n" & ChrW(&H0103) & "m"
    d("CT_GIAI_NGAN") = CStr(wsG.Range("C24").Value)
    d("CT_BO_SUNG") = CStr(wsG.Range("C25").Value)
    d("CT_BS_TEN") = CStr(wsG.Range("C25").Value)
    d("CT_BS_LOAI") = CStr(wsG.Range("C26").Value)
    d("CT_BS_NGAY") = CStr(wsG.Range("C27").Value)
    d("DK_KHAC_1") = CStr(wsG.Range("C28").Value)
    d("DK_KHAC_2") = CStr(wsG.Range("C29").Value)
    d("GT_TSBD") = Format(Nz(wsG.Range("C15").Value), "#,##0")
    d("TY_LE_TSBD") = Format(Nz(wsG.Range("C44").Value) * 100, "0.00")
    d("TONG_TIEN_HD") = Format(Nz(wsG.Range("C45").Value), "#,##0")
    d("TONG_TIEN_GN") = Format(Nz(wsG.Range("C46").Value), "#,##0")

    ' --- bang han muc: ban trieu dong (mau don vi) ---
    d("HM1") = Format(hm1 / 1000000, "#,##0")
    d("HM2") = Format(hm2 / 1000000, "#,##0")
    d("DUNO1") = Format(duNoTruoc / 1000000, "#,##0")
    d("KD1") = Format((hm1 - duNoTruoc) / 1000000, "#,##0")
    ' --- bang han muc: ban VND (mau chuan MB1022) ---
    d("HM_CAP") = Format(hm1, "#,##0")
    d("DU_NO_TRUOC") = Format(duNoTruoc, "#,##0")
    d("THU_NO_NGAY") = Format(thuNo, "#,##0")
    d("KHA_DUNG") = Format(hm1 - duNoTruoc, "#,##0")

    ' --- o tick tren UNC ---
    If InStr(1, CStr(wsG.Range("C30").Value), "ngo" & ChrW(&H00E0) & "i", vbTextCompare) > 0 Then
        d("PHI_TRONG") = "[   ]": d("PHI_NGOAI") = "[X]"
    Else
        d("PHI_TRONG") = "[X]": d("PHI_NGOAI") = "[   ]"
    End If
    If InStr(1, CStr(wsG.Range("C31").Value), "247") > 0 Then
        d("CK_LNH") = "[   ]": d("CK_247") = "[X]"
    Else
        d("CK_LNH") = "[X]": d("CK_247") = "[   ]"
    End If
End Sub

'==========================================================================
' 3. TAO TUNG LOAI FILE
'==========================================================================
Private Function MoTemplate(wdApp As Object, tplPath As String) As Object
    Dim doc As Object
    If Not CoFile(tplPath) Then
        Err.Raise 53, , "Khong tim thay bieu mau: " & tplPath
    End If
    On Error Resume Next
    Set doc = wdApp.Documents.Open(tplPath, , False)
    On Error GoTo 0
    If doc Is Nothing Then
        On Error Resume Next
        If wdApp.ProtectedViewWindows.Count > 0 Then
            Set doc = wdApp.ProtectedViewWindows(wdApp.ProtectedViewWindows.Count).Edit
        End If
        On Error GoTo 0
    End If
    If doc Is Nothing Then
        Err.Raise 5174, , "Khong mo duoc bieu mau: " & tplPath & _
            "  (file co the dang bi Windows chan - chuot phai file -> Properties -> tick Unblock)"
    End If
    Set MoTemplate = doc
End Function

'------------------------ KUNN ------------------------
Private Sub TaoKUNN(wdApp As Object, tplPath As String, outPath As String, d As Object)
    Dim doc As Object, wsT As Worksheet, k As Variant

    gStage = "KUNN: mo bieu mau"
    Set doc = MoTemplate(wdApp, tplPath)
    Set wsT = ThisWorkbook.Sheets(S_TH)

    gStage = "KUNN: do bang ben thu huong"
    Call DoBangLap(doc, "{{TH_STT}}|{{TH_TEN}}", wsT, TH_R1, TH_R2, 2, _
                   Array("{{TH_STT}}", "{{TH_TEN}}", "{{TH_STK}}", "{{TH_NH}}"), _
                   Array(0, 2, 3, 4), Array("STT", "T", "T", "T"))

    gStage = "KUNN: chen khoi TSBD"
    Call ChenKhoiTSBD(doc)

    For Each k In d.Keys
        gStage = "KUNN: thay ma {{" & k & "}}"
        Call RepDoc(doc, "{{" & k & "}}", CStr(d(k)))
    Next k

    gStage = "KUNN: luu file " & outPath
    doc.SaveAs2 outPath, 16
    doc.Close False
End Sub

'------------------------ TO TRINH ------------------------
Private Sub TaoToTrinh(wdApp As Object, tplPath As String, outPath As String, d As Object)
    Dim doc As Object, wsH As Worksheet, wsS As Worksheet, wsK As Worksheet, k As Variant

    gStage = "To trinh: mo bieu mau"
    Set doc = MoTemplate(wdApp, tplPath)
    Set wsH = ThisWorkbook.Sheets(S_HD)
    Set wsS = ThisWorkbook.Sheets(S_TS)
    Set wsK = ThisWorkbook.Sheets(S_DK)

    gStage = "To trinh: do bang ke chung tu"
    Call DoBangLap(doc, "{{HD_STT}}", wsH, HD_R1, HD_R2, 2, _
        Array("{{HD_STT}}", "{{HD_NCC}}", "{{HD_SOHD}}", "{{HD_HOADON}}", "{{HD_MA}}", _
              "{{HD_NGAY}}", "{{HD_TIEN_HD}}", "{{HD_TIEN_GN}}", "{{HD_HH}}", "{{HD_GHICHU}}"), _
        Array(0, 2, 3, 4, 4, 5, 6, 7, 8, 9), _
        Array("STT", "T", "T", "T", "T", "D", "N", "N", "T", "T"), _
        GopBangKe(), NhanTongNhom())

    gStage = "To trinh: gom khoi TSBD"
    d("TSBD_ND") = GomDong(wsS, TS_R1, TS_R2, 1, "TOTRINH", 3, 3)
    d("TSBD_GT") = GomDong(wsS, TS_R1, TS_R2, 1, "TOTRINH", 3, 4)

    gStage = "To trinh: gom dieu kien tin dung"
    d("DKTD_ND") = GomDong(wsK, DK_R1, DK_R2, 0, "", 1, 1)
    d("DKTD_KQ") = GomDong(wsK, DK_R1, DK_R2, 0, "", 1, 2)

    For Each k In d.Keys
        gStage = "To trinh: thay ma {{" & k & "}}"
        Call RepDoc(doc, "{{" & k & "}}", CStr(d(k)))
    Next k

    gStage = "To trinh: luu file " & outPath
    doc.SaveAs2 outPath, 16
    doc.Close False
End Sub

'------------------------ BANG KE CHUNG TU ------------------------
' Bang ke xuat ra file Word. So dong bang tu dai theo so hoa don thuc te
' o sheet HOA_DON nen khong con gioi han 25 dong nhu ban PDF cu.
Private Sub TaoBangKe(wdApp As Object, tplPath As String, outPath As String, d As Object)
    Dim doc As Object, wsH As Worksheet, k As Variant
    Dim i As Long, n As Long, tongHD As Double, tongGN As Double

    gStage = "Bang ke: mo bieu mau"
    Set doc = MoTemplate(wdApp, tplPath)
    Set wsH = ThisWorkbook.Sheets(S_HD)

    n = DemDong(wsH, 2, HD_R1, HD_R2)
    If n < 1 Then
        doc.Close False
        Err.Raise 5000, , "Sheet HOA_DON chua co dong nao. Nhap bang ke tu dong " & HD_R1 & " roi xuat lai."
    End If

    gStage = "Bang ke: do " & n & " dong chung tu"
    Call DoBangLap(doc, "{{BK_STT}}", wsH, HD_R1, HD_R2, 2, _
        Array("{{BK_STT}}", "{{BK_NCC}}", "{{BK_MAKH}}", "{{BK_NGAY}}", _
              "{{BK_TIEN_HD}}", "{{BK_TIEN_GN}}", "{{BK_HH}}"), _
        Array(0, 2, 4, 5, 6, 7, 8), _
        Array("STT", "T", "T", "D", "N", "N", "T"), _
        GopBangKe(), NhanTongNhom())

    For i = HD_R1 To HD_R2
        If Len(Trim(CStr(wsH.Cells(i, 2).Value))) > 0 Then
            tongHD = tongHD + Nz(wsH.Cells(i, 6).Value)
            tongGN = tongGN + Nz(wsH.Cells(i, 7).Value)
        End If
    Next i
    d("BK_TONG_HD") = Format(tongHD, "#,##0")
    d("BK_TONG_GN") = Format(tongGN, "#,##0")

    For Each k In d.Keys
        gStage = "Bang ke: thay ma {{" & k & "}}"
        Call RepDoc(doc, "{{" & k & "}}", CStr(d(k)))
    Next k

    gStage = "Bang ke: luu file " & outPath
    doc.SaveAs2 outPath, 16
    doc.Close False
End Sub

'------------------------ UNC ------------------------
Private Sub TaoUNC(wdApp As Object, tplPath As String, outPath As String, d As Object, _
                   wsT As Worksheet, r As Long)
    Dim doc As Object, k As Variant, soTien As Double, noiDung As String
    Set doc = MoTemplate(wdApp, tplPath)

    soTien = Nz(wsT.Cells(r, 6).Value)
    If soTien = 0 Then soTien = Nz(ThisWorkbook.Sheets(S_GN).Range("C7").Value)
    noiDung = CStr(wsT.Cells(r, 7).Value)

    d("TEN_TK_THU_HUONG") = CStr(wsT.Cells(r, 2).Value)
    d("STK_THU_HUONG") = CStr(wsT.Cells(r, 3).Value)
    d("NH_THU_HUONG") = CStr(wsT.Cells(r, 4).Value)
    d("NH_THU_HUONG_DD") = CStr(wsT.Cells(r, 5).Value)
    d("NOI_DUNG_CT") = noiDung
    d("SO_TIEN") = Format(soTien, "#,##0")
    d("SO_TIEN_CHU_UNC") = DocSoTien(soTien)

    For Each k In d.Keys
        Call RepDoc(doc, "{{" & k & "}}", CStr(d(k)))
    Next k
    doc.SaveAs2 outPath, 16
    doc.Close False

    ' tra lai gia tri chung cho cac file sau
    d("SO_TIEN") = Format(Nz(ThisWorkbook.Sheets(S_GN).Range("C7").Value), "#,##0")
    d("SO_TIEN_CHU_UNC") = DocSoTien(ThisWorkbook.Sheets(S_GN).Range("C7").Value)
End Sub

'==========================================================================
' 4. TIEN ICH DO DU LIEU VAO WORD
'==========================================================================
' Do du lieu vao bang co dong mau chua token. Cot nao trong bieu mau khong co
' thi token do khong ton tai -> tu dong bo qua.
Private Sub DoBangLap(doc As Object, dauHieu As String, ws As Worksheet, _
                      r1 As Long, r2 As Long, colKiemTra As Long, _
                      toks As Variant, colsNguon As Variant, kieu As Variant, _
                      Optional gopTheoCot As Long = 0, Optional nhanTong As String = "")
    ' LUU Y QUAN TRONG:
    ' Word.Rows.Add chen dong RONG (khong phai ban sao dong mau) va chen TRUOC dong tham chieu.
    ' Vi vay khong the dua vao viec cac dong moi co san ma {{...}}.
    ' Cach lam: doc so do "o thu may chua ma nao" tu dong mau TRUOC, roi dien theo vi tri o.
    Dim tbl As Object, t As Object, rowIdx As Long, i As Long, j As Long, n As Long
    Dim rc As Long, rw As Object, v As Variant, s As String, ci As Long, nCell As Long
    Dim dh As Variant, ok As Boolean, sBase As String, txt As String
    Dim mapTok(1 To 30) As String, mapTinh(1 To 30) As String
    Dim mapFont(1 To 30) As String, mapSize(1 To 30) As Single
    Dim mapBold(1 To 30) As Long, mapItal(1 To 30) As Long, mapCan(1 To 30) As Long
    Dim nOut As Long, k As Long, soTT As Long, ciNhom As Long, ciTienDau As Long
    Dim loaiDong() As Byte, srcDong() As Long, nhomDong() As String
    Dim dauNhom() As Byte, khongGop() As Byte
    Dim tuDong() As Long, denDong() As Long, tong(0 To 30) As Double
    Dim oNhom() As Object, oT1() As Object, oT2() As Object
    Dim gTruoc As String, gNay As String, dinhTren As Long

    sBase = gStage

    ' --- lap DANH SACH dong co du lieu (khong dua vao "r1 + i - 1") ---
    ' Nho vay dong trong o giua khong lam lech du lieu va khong bi bo sot dong nao.
    Dim srcR() As Long
    ReDim srcR(1 To (r2 - r1 + 1))
    n = 0
    For i = r1 To r2
        If Len(Trim(CStr(ws.Cells(i, colKiemTra).Value))) > 0 Then
            n = n + 1
            srcR(n) = i
        End If
    Next i
    If n < 1 Then Exit Sub

    gStage = sBase & " > tim bang trong bieu mau"
    dh = Split(dauHieu, "|")
    For Each t In doc.Tables
        ok = False
        For j = 0 To UBound(dh)
            If InStr(t.Range.Text, dh(j)) > 0 Then ok = True
        Next j
        If ok Then Set tbl = t: Exit For
    Next t
    If tbl Is Nothing Then Exit Sub

    gStage = sBase & " > tim dong mau"
    On Error Resume Next
    rc = tbl.Rows.Count
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        Err.Raise 5991, , "Bang trong bieu mau con o gop doc (merged cell) nen khong them dong duoc. " & _
                          "Kiem tra lai file template."
    End If
    On Error GoTo 0

    For i = 1 To tbl.Rows.Count
        ok = False
        For j = 0 To UBound(dh)
            If InStr(tbl.Rows(i).Range.Text, dh(j)) > 0 Then ok = True
        Next j
        If ok Then rowIdx = i: Exit For
    Next i
    If rowIdx = 0 Then Exit Sub

    ' --- doc so do cot cua dong mau ---
    gStage = sBase & " > doc so do cot"
    nCell = tbl.Rows(rowIdx).Cells.Count
    If nCell > 30 Then nCell = 30
    For ci = 1 To nCell
        txt = CellText(tbl.Rows(rowIdx).Cells(ci))
        mapTok(ci) = ""
        mapTinh(ci) = txt
        For j = 0 To UBound(toks)
            If InStr(txt, CStr(toks(j))) > 0 Then
                mapTok(ci) = CStr(j)          ' luu chi so token
                mapTinh(ci) = ""
                Exit For
            End If
        Next j
        ' --- ghi lai dinh dang chu cua o mau de ap lai cho cac dong them moi ---
        mapFont(ci) = "": mapSize(ci) = 0: mapBold(ci) = 9999999
        mapItal(ci) = 9999999: mapCan(ci) = 9999999
        On Error Resume Next
        mapFont(ci) = tbl.Rows(rowIdx).Cells(ci).Range.Font.Name
        mapSize(ci) = tbl.Rows(rowIdx).Cells(ci).Range.Font.Size
        mapBold(ci) = tbl.Rows(rowIdx).Cells(ci).Range.Font.Bold
        mapItal(ci) = tbl.Rows(rowIdx).Cells(ci).Range.Font.Italic
        mapCan(ci) = tbl.Rows(rowIdx).Cells(ci).Range.Paragraphs(1).Alignment
        On Error GoTo 0
    Next ci

    ' --- tim o dung de gop doc (cot hien thi ung voi cot gom nhom) va o tien dau tien ---
    ciNhom = 0: ciTienDau = 0
    For ci = 1 To nCell
        If Len(mapTok(ci)) > 0 Then
            j = CLng(mapTok(ci))
            If gopTheoCot > 0 Then
                If colsNguon(j) = gopTheoCot And ciNhom = 0 Then ciNhom = ci
            End If
            If kieu(j) = "N" And ciTienDau = 0 Then ciTienDau = ci
        End If
    Next ci

    ' --- lap ke hoach dong: dong du lieu + dong tong cua tung nhom ---
    ReDim loaiDong(1 To n * 2 + 2)
    ReDim srcDong(1 To n * 2 + 2)
    ReDim nhomDong(1 To n * 2 + 2)
    ReDim tuDong(1 To n * 2 + 2)
    ReDim denDong(1 To n * 2 + 2)
    ReDim dauNhom(1 To n * 2 + 2)
    ReDim khongGop(1 To n * 2 + 2)
    nOut = 0
    If gopTheoCot > 0 And ciTienDau > 1 Then
        dinhTren = 1
        For i = 1 To n
            gNay = Trim(CStr(ws.Cells(srcR(i), gopTheoCot).Value))
            If i > 1 Then
                If gNay <> gTruoc Then
                    nOut = nOut + 1
                    loaiDong(nOut) = 1: nhomDong(nOut) = gTruoc
                    tuDong(nOut) = dinhTren: denDong(nOut) = i - 1
                    dinhTren = i
                End If
            End If
            nOut = nOut + 1
            loaiDong(nOut) = 0: srcDong(nOut) = i
            If i = 1 Then
                dauNhom(nOut) = 1
            ElseIf gNay <> gTruoc Then
                dauNhom(nOut) = 1
            End If
            gTruoc = gNay
        Next i
        nOut = nOut + 1
        loaiDong(nOut) = 1: nhomDong(nOut) = gTruoc
        tuDong(nOut) = dinhTren: denDong(nOut) = n
    Else
        For i = 1 To n
            nOut = nOut + 1
            loaiDong(nOut) = 0: srcDong(nOut) = i
        Next i
    End If

    ' --- nhom qua dai thi lap lai ten NCC tren tung dong, khong gop o doc ---
    ' Word chi ve chu cua o gop doc o TRANG DAU, nen nhom dai ma gop lai thi
    ' cac trang sau se trong cot ten. Voi nhom dai ta in ten tren moi dong.
    If gopTheoCot > 0 And ciNhom > 0 Then
        Dim kD As Long, kC As Long, soDong As Long
        kD = 0
        For k = 1 To nOut + 1
            If k <= nOut And loaiDong(k) = 0 Then
                If kD = 0 Then kD = k
            Else
                If kD > 0 Then
                    kC = k - 1
                    soDong = kC - kD + 1
                    If soDong > GOP_TOI_DA Then
                        For i = kD To kC
                            dauNhom(i) = 1
                            khongGop(i) = 1
                        Next i
                    End If
                    kD = 0
                End If
            End If
        Next k
    End If

    ' --- them dong (chen truoc dong mau -> dong mau tut xuong cuoi) ---
    ' Chen het dong TRUOC roi moi gop o, vi Word khong cho them dong khi bang
    ' da co o gop doc (loi 5991).
    gStage = sBase & " > them " & nOut & " dong"
    For i = 2 To nOut
        tbl.Rows.Add tbl.Rows(rowIdx)
        If (i Mod 25) = 0 Then Application.StatusBar = "Dang tao bang: " & i & "/" & nOut & " dong..."
    Next i
    Application.StatusBar = False

    ReDim oNhom(1 To nOut)
    ReDim oT1(1 To nOut)
    ReDim oT2(1 To nOut)

    ' --- dien tung dong theo vi tri o ---
    soTT = 0
    For k = 1 To nOut
        gStage = sBase & " > dien dong " & k & "/" & nOut
        Set rw = tbl.Rows(rowIdx + k - 1)

        If loaiDong(k) = 0 Then
            '---------------- dong du lieu ----------------
            soTT = soTT + 1
            i = srcDong(k)
            For ci = 1 To nCell
                If Len(mapTok(ci)) > 0 Then
                    j = CLng(mapTok(ci))
                    If colsNguon(j) = 0 Then
                        s = CStr(soTT)
                    Else
                        v = ws.Cells(srcR(i), colsNguon(j)).Value
                        Select Case kieu(j)
                            Case "D": s = FDate(v)
                            Case "N": s = IIf(IsNumeric(v), Format(Nz(v), "#,##0"), "")
                            Case Else: s = CStr(v)
                        End Select
                    End If
                    ' o thuoc cot se gop doc: chi dong dau nhom giu chu,
                    ' cac dong noi tiep phai de trong neu khong Word se noi chu lai
                    If ci = ciNhom And dauNhom(k) = 0 Then s = ""
                    rw.Cells(ci).Range.Text = s
                    Call ApDinhDang(rw.Cells(ci), mapFont(ci), mapSize(ci), _
                                    mapBold(ci), mapItal(ci), mapCan(ci))
                ElseIf k < nOut And Len(mapTinh(ci)) > 0 Then
                    rw.Cells(ci).Range.Text = mapTinh(ci)
                    Call ApDinhDang(rw.Cells(ci), mapFont(ci), mapSize(ci), _
                                    mapBold(ci), mapItal(ci), mapCan(ci))
                End If
            Next ci
            If ciNhom > 0 Then Set oNhom(k) = rw.Cells(ciNhom)
        Else
            '---------------- dong tong cua nhom ----------------
            For j = 0 To UBound(toks)
                tong(j) = 0
            Next j
            For i = tuDong(k) To denDong(k)
                For j = 0 To UBound(toks)
                    If kieu(j) = "N" And colsNguon(j) > 0 Then
                        tong(j) = tong(j) + Nz(ws.Cells(srcR(i), colsNguon(j)).Value)
                    End If
                Next j
            Next i
            For ci = 1 To nCell
                s = ""
                If ci = 1 Then
                    s = nhanTong & nhomDong(k)
                ElseIf Len(mapTok(ci)) > 0 Then
                    j = CLng(mapTok(ci))
                    If kieu(j) = "N" And colsNguon(j) > 0 Then s = Format(tong(j), "#,##0")
                End If
                rw.Cells(ci).Range.Text = s
                Call ApDinhDang(rw.Cells(ci), mapFont(ci), mapSize(ci), _
                                -1, mapItal(ci), mapCan(ci))
            Next ci
            On Error Resume Next
            rw.Cells(1).Range.Paragraphs(1).Alignment = 1   ' wdAlignParagraphCenter
            On Error GoTo 0
            If ciTienDau > 1 Then
                Set oT1(k) = rw.Cells(1)
                Set oT2(k) = rw.Cells(ciTienDau - 1)
            End If
        End If
    Next k

    If gopTheoCot = 0 Or ciTienDau <= 1 Then Exit Sub

    ' --- gop NGANG phan nhan cua dong tong ---
    ' Sau khi Merge, Word giu lai dau doan cua TUNG o bi gop nen dong tong bi
    ' cao gap 3-4 lan. Ghi lai chu mot lan nua thi ca o chi con dung 1 doan.
    gStage = sBase & " > gop o dong tong"
    For k = nOut To 1 Step -1
        If loaiDong(k) = 1 Then
            If Not oT1(k) Is Nothing And Not oT2(k) Is Nothing Then
                On Error Resume Next
                oT1(k).Merge oT2(k)
                oT1(k).Range.Text = nhanTong & nhomDong(k)
                Call ApDinhDang(oT1(k), mapFont(1), mapSize(1), -1, mapItal(1), 1)
                On Error GoTo 0
            End If
        End If
    Next k

    ' --- gop DOC o ten nha cung cap trong tung nhom ---
    If ciNhom > 0 Then
        gStage = sBase & " > gop doc cot ten"
        Dim kTop As Long
        kTop = 0
        For k = 1 To nOut
            If loaiDong(k) = 0 Then
                If kTop = 0 Then kTop = k
            Else
                If kTop > 0 And k - 1 > kTop And khongGop(kTop) = 0 Then
                    On Error Resume Next
                    oNhom(kTop).Merge oNhom(k - 1)
                    On Error GoTo 0
                End If
                kTop = 0
            End If
        Next k
        If kTop > 0 And nOut > kTop Then
            If khongGop(kTop) = 0 Then
                On Error Resume Next
                oNhom(kTop).Merge oNhom(nOut)
                On Error GoTo 0
            End If
        End If
    End If
End Sub

' Ap font / co chu / dam / nghieng / canh le cua o mau cho o vua dien chu.
' Word.Rows.Add chen dong RONG nen neu khong ap lai, chu se ra font mac dinh.
Private Sub ApDinhDang(cel As Object, tenFont As String, coChu As Single, _
                       dam As Long, nghieng As Long, can As Long)
    On Error Resume Next
    If Len(tenFont) > 0 Then cel.Range.Font.Name = tenFont
    If coChu > 0 And coChu < 1000 Then cel.Range.Font.Size = coChu
    If dam = 0 Or dam = -1 Then cel.Range.Font.Bold = dam
    If nghieng = 0 Or nghieng = -1 Then cel.Range.Font.Italic = nghieng
    If can >= 0 And can <= 4 Then cel.Range.Paragraphs(1).Alignment = can
    On Error GoTo 0
End Sub

' Lay chu trong o bang cua Word, bo 2 ky tu danh dau cuoi o
Private Function CellText(c As Object) As String
    Dim s As String
    s = c.Range.Text
    Do While Len(s) > 0
        If Right(s, 1) = Chr(7) Or Right(s, 1) = Chr(13) Then
            s = Left(s, Len(s) - 1)
        Else
            Exit Do
        End If
    Loop
    CellText = s
End Function

' Chen khoi TSBD (loai KUNN) vao vi tri 2 marker {{TSBD_L1}} / {{TSBD_L2}}
Private Sub ChenKhoiTSBD(doc As Object)
    Dim ws As Worksheet, p As Object, p1 As Object, p2 As Object
    Dim r As Long, cap As Long, txt As String, rng As Object, pNew As Object

    Set ws = ThisWorkbook.Sheets(S_TS)
    For Each p In doc.Paragraphs
        If p1 Is Nothing Then
            If InStr(p.Range.Text, "{{TSBD_L1}}") > 0 Then Set p1 = p
        End If
        If p2 Is Nothing Then
            If InStr(p.Range.Text, "{{TSBD_L2}}") > 0 Then Set p2 = p
        End If
    Next p
    If p1 Is Nothing Then Exit Sub

    For r = TS_R1 To TS_R2
        If UCase(Trim(CStr(ws.Cells(r, 1).Value))) = "KUNN" Then
            txt = Trim(CStr(ws.Cells(r, 3).Value))
            If Len(txt) > 0 Then
                cap = CLng(Nz(ws.Cells(r, 2).Value))
                Set rng = p1.Range
                rng.Collapse 1                      ' wdCollapseStart
                rng.InsertBefore txt & vbCr
                Set pNew = p1.Previous
                If cap = 2 And Not p2 Is Nothing Then
                    On Error Resume Next
                    pNew.LeftIndent = p2.LeftIndent
                    pNew.FirstLineIndent = p2.FirstLineIndent
                    On Error GoTo 0
                End If
            End If
        End If
    Next r

    p1.Range.Delete
    If Not p2 Is Nothing Then p2.Range.Delete
End Sub

' Gom nhieu dong cua 1 cot thanh 1 chuoi, ngan cach bang dau xuong dong trong o
Private Function GomDong(ws As Worksheet, r1 As Long, r2 As Long, _
                         colLoc As Long, giaTriLoc As String, _
                         colKiemTra As Long, colLay As Long) As String
    Dim r As Long, s As String, v As String, lay As Boolean
    For r = r1 To r2
        If Len(Trim(CStr(ws.Cells(r, colKiemTra).Value))) > 0 Then
            ' Luu y: VBA khong "short-circuit" toan tu Or/And nen phai tach ra,
            ' neu khong se goi Cells(r, 0) -> loi 1004
            If colLoc = 0 Then
                lay = True
            Else
                lay = (UCase(Trim(CStr(ws.Cells(r, colLoc).Value))) = UCase(giaTriLoc))
            End If
            If lay Then
                v = Trim(CStr(ws.Cells(r, colLay).Value))
                If Len(v) = 0 Then v = "-"
                If Len(s) > 0 Then s = s & Chr(11)
                s = s & v
            End If
        End If
    Next r
    GomDong = s
End Function

' Dem so dong co du lieu nam NGOAI vung bang ke (de canh bao xuat thieu)
Private Function DemDongNgoaiVung(ws As Worksheet, col As Long, r2 As Long) As Long
    ' LUU Y: dong r2 + 1 la dong TONG CONG cua bang ke - dong do luon co chu
    ' "TONG CONG" o cot B nen phai bo qua, neu khong se bao nham 1 dong thua.
    Dim r As Long, n As Long, cuoi As Long
    On Error Resume Next
    cuoi = ws.Cells(ws.Rows.Count, col).End(-4162).Row     ' xlUp
    On Error GoTo 0
    If cuoi <= r2 + 1 Then Exit Function
    For r = r2 + 2 To cuoi
        If Len(Trim(CStr(ws.Cells(r, col).Value))) > 0 Then n = n + 1
    Next r
    DemDongNgoaiVung = n
End Function

Private Function DemDong(ws As Worksheet, col As Long, r1 As Long, r2 As Long) As Long
    Dim r As Long, n As Long
    For r = r1 To r2
        If Len(Trim(CStr(ws.Cells(r, col).Value))) > 0 Then n = n + 1
    Next r
    DemDong = n
End Function

Private Function LamSachTen(ByVal s As String) As String
    Dim bad As Variant, i As Long
    bad = Array("\", "/", ":", "*", "?", Chr(34), "<", ">", "|")
    For i = 0 To UBound(bad)
        s = Replace(s, bad(i), " ")
    Next i
    s = Trim(s)
    If Len(s) > 40 Then s = Left(s, 40)
    LamSachTen = s
End Function

Private Sub RepDoc(doc As Object, tok As String, val As String)
    Dim st As Object, cur As Object
    For Each st In doc.StoryRanges
        Set cur = st
        Do While Not cur Is Nothing
            Call RepRange(cur, tok, val)
            ' NextStoryRange co the loi tren mot so loai story -> bo qua, khong lam hong ca file
            On Error Resume Next
            Set cur = cur.NextStoryRange
            If Err.Number <> 0 Then Err.Clear: Set cur = Nothing
            On Error GoTo 0
        Loop
    Next st
End Sub

Private Sub RepRange(st0 As Object, tok As String, val As String)
    Dim rg As Object, guard As Long
    Do
        Set rg = st0.Duplicate
        With rg.Find
            .ClearFormatting
            .Text = tok
            .Forward = True
            .Wrap = 0
            .Format = False
            .MatchCase = True
            .MatchWildcards = False
            If Not .Execute Then Exit Do
        End With
        rg.Text = val
        guard = guard + 1
        If guard > 500 Then Exit Do
    Loop
End Sub

'==========================================================================
' 5. GHI SO
'==========================================================================
Public Sub GhiSoKheUoc()
    ' Bo cuc so KHE_UOC ban 6.0:
    '  A STT (cong thuc) | B So KUNN | C Han muc | D Ngay GN | E Ngay dao han | F So ngay | G Lai suat
    '  H Goi / UBG | I Goc vay | J Da thu | K Ngay thu | L..O cong thuc | P Ben thu huong | Q Chung tu | R Ghi chu | T thu tu DH
    Dim ws As Worksheet, wsG As Worksheet, wsT As Worksheet
    Dim r As Long, i As Long, rTrung As Long, rCuoi As Long, rCungHD As Long
    Dim soKUNN As String, tenTH As String, tienTo As String
    Set ws = ThisWorkbook.Sheets(S_KU)
    Set wsG = ThisWorkbook.Sheets(S_GN)
    Set wsT = ThisWorkbook.Sheets(S_TH)
    soKUNN = CStr(wsG.Range("C37").Value)

    ' Bao ve: cot H cua so phai la "Goi / UBG" - neu khong thi file va module khong cung ban, KHONG ghi
    If InStr(1, CStr(ws.Cells(4, 8).Value), "UBG", vbTextCompare) = 0 Then
        MsgBox "Sheet KHE_UOC khong dung bo cuc ban 6.0 (cot H phai la 'Goi / UBG')." & vbCrLf & vbCrLf & _
               "Khong ghi so de tranh ghi sai cot. Dung file Excel ban 6.0 di kem module nay.", vbCritical, "Sai bo cuc so"
        Exit Sub
    End If

    Dim gocSo As String, vSo As String
    gocSo = soKUNN
    If InStr(gocSo, ")") > 0 Then gocSo = Left$(gocSo, InStr(gocSo, ")"))
    tienTo = CStr(DM(ThisWorkbook.Sheets(S_DM), "PREFIX_KUNN"))

    rCuoi = ws.Cells(ws.Rows.Count, 2).End(xlUp).Row
    If rCuoi < KU_R1 Then rCuoi = KU_R1 - 1
    rTrung = 0: rCungHD = 0
    For i = KU_R1 To rCuoi
        vSo = CStr(ws.Cells(i, 2).Value)
        If Len(tienTo) > 0 Then
            If Left$(vSo, Len(tienTo) + 1) = tienTo & "(" Then rCungHD = i
        End If
        If InStr(vSo, ")") > 0 Then vSo = Left$(vSo, InStr(vSo, ")"))
        If Len(gocSo) > 0 And vSo = gocSo And rTrung = 0 Then rTrung = i
    Next i

    If rTrung > 0 Then
        If MsgBox("Khe uoc " & BoDau(soKUNN) & " da co trong so KHE_UOC (dong " & rTrung & ")." & vbCrLf & vbCrLf & _
                  "Cap nhat lai so lieu dong do theo lan xuat nay?" & vbCrLf & vbCrLf & _
                  "Yes = ghi de so lieu moi" & vbCrLf & _
                  "No  = giu nguyen dong cu, chi in lai giay to", _
                  vbQuestion + vbYesNo, "So KUNN da ton tai") = vbNo Then Exit Sub
        r = rTrung
    Else
        ' Ghi NGAY DUOI khe uoc cuoi cung cua cung hop dong -> so luon theo thu tu, khong roi xuong cuoi
        If rCungHD > 0 Then r = rCungHD + 1 Else r = rCuoi + 1
        If r > KU_R2 Then MsgBox "So KHE_UOC da day (" & (KU_R2 - KU_R1 + 1) & " dong).", vbCritical: Exit Sub
        Application.EnableEvents = False
        If Len(CStr(ws.Cells(r, 2).Value)) > 0 Then ws.Rows(r).Insert Shift:=xlDown
        If r > KU_R1 Then
            ' chep dinh dang + cong thuc tu dong tren, roi xoa phan nhap tay
            ws.Rows(r - 1).Copy ws.Rows(r)
            ws.Range(ws.Cells(r, 2), ws.Cells(r, 5)).ClearContents    ' B..E
            ws.Range(ws.Cells(r, 7), ws.Cells(r, 11)).ClearContents   ' G..K
            ws.Range(ws.Cells(r, 16), ws.Cells(r, 18)).ClearContents  ' P..R
        End If
        Application.EnableEvents = True
    End If

    tenTH = CStr(wsT.Cells(TH_R1, 2).Value)
    If DemDong(wsT, 2, TH_R1, TH_R2) > 1 Then tenTH = tenTH & " (+" & (DemDong(wsT, 2, TH_R1, TH_R2) - 1) & " ben khac)"

    Application.EnableEvents = False
    If rTrung = 0 Then
        ws.Cells(r, 3).Value = "HMTD 1"
        ws.Cells(r, 10).Value = 0
    End If
    ws.Cells(r, 2).Value = soKUNN
    ws.Cells(r, 4).Value = wsG.Range("C6").Value
    ws.Cells(r, 5).Value = wsG.Range("C9").Value
    ws.Cells(r, 7).Value = wsG.Range("C10").Value
    ws.Cells(r, 8).Value = wsG.Range("C16").Value      ' Goi / UBG
    ws.Cells(r, 9).Value = wsG.Range("C7").Value
    ws.Cells(r, 16).Value = tenTH
    ws.Cells(r, 17).Value = wsG.Range("C25").Value
    Application.EnableEvents = True
End Sub

' Sap xep lai so KHE_UOC: Han muc -> Ngay GN -> So KUNN (dung khi lo nhap tay lon thu tu)
Public Sub SapXepSoKheUoc()
    Dim ws As Worksheet, rCuoi As Long
    Set ws = ThisWorkbook.Sheets(S_KU)
    If InStr(1, CStr(ws.Cells(4, 8).Value), "UBG", vbTextCompare) = 0 Then
        MsgBox "Sheet KHE_UOC khong dung bo cuc ban 6.0.", vbCritical: Exit Sub
    End If
    rCuoi = ws.Cells(ws.Rows.Count, 2).End(xlUp).Row
    If rCuoi <= KU_R1 Then MsgBox "So chua co du lieu de sap xep.", vbInformation: Exit Sub
    If MsgBox("Sap xep lai " & (rCuoi - KU_R1 + 1) & " dong cua so KHE_UOC theo:" & vbCrLf & _
              "  Han muc (HMTD 1 truoc HMTD 2) -> Ngay giai ngan -> So KUNN ?", _
              vbQuestion + vbYesNo, "Sap xep so khe uoc") = vbNo Then Exit Sub
    Application.EnableEvents = False
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("C" & KU_R1 & ":C" & rCuoi), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("D" & KU_R1 & ":D" & rCuoi), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("B" & KU_R1 & ":B" & rCuoi), Order:=xlAscending
        .SetRange ws.Range("A" & KU_R1 & ":T" & rCuoi)
        .Header = xlNo
        .Apply
    End With
    Application.EnableEvents = True
    Application.Calculate
    MsgBox "Da sap xep xong.", vbInformation
End Sub

Private Sub GhiLichSu(base As String)
    Dim ws As Worksheet, wsG As Worksheet, r As Long
    Set ws = ThisWorkbook.Sheets(S_LS)
    Set wsG = ThisWorkbook.Sheets(S_GN)
    r = 5
    Do While Len(CStr(ws.Cells(r, 1).Value)) > 0
        r = r + 1
    Loop
    ws.Cells(r, 1).Value = Now
    ws.Cells(r, 1).NumberFormat = "dd/mm/yyyy hh:mm"
    ws.Cells(r, 2).Value = wsG.Range("C37").Value
    ws.Cells(r, 3).Value = wsG.Range("C6").Value
    ws.Cells(r, 3).NumberFormat = "dd/mm/yyyy"
    ws.Cells(r, 4).Value = wsG.Range("C7").Value
    ws.Cells(r, 4).NumberFormat = "#,##0"
    ws.Cells(r, 5).Value = wsG.Range("C10").Value
    ws.Cells(r, 5).NumberFormat = "0.00%"
    ws.Cells(r, 6).Value = wsG.Range("C42").Value
    ws.Cells(r, 7).Value = ThisWorkbook.Sheets(S_TH).Cells(TH_R1, 2).Value
    ws.Cells(r, 8).Value = Application.UserName
    ws.Cells(r, 9).Value = base
    ws.Cells(r, 10).Value = wsG.Range("C16").Value   ' goi / UBG
End Sub

'==========================================================================
' 6. TIEN ICH
'==========================================================================
Public Sub LamMoi()
    Application.CalculateFullRebuild
    MsgBox "Da tinh lai toan bo cong thuc va canh bao.", vbInformation
End Sub

' Sap xep DANH_BA_TH theo Ten roi So tai khoan de cac dong cung ten nam lien nhau
' (bat buoc thi o chon So tai khoan ben sheet THU_HUONG moi loc dung).
Public Sub SapXepDanhBa()
    Dim ws As Worksheet, n As Long
    Set ws = Nothing
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets("STK")
    If ws Is Nothing Then Set ws = ThisWorkbook.Sheets("DANH_BA_TH")
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "Khong tim thay sheet danh ba ben thu huong (STK hoac DANH_BA_TH).", vbCritical
        Exit Sub
    End If
    n = 5
    Do While Len(Trim(CStr(ws.Cells(n, 1).Value))) > 0
        n = n + 1
        If n > 104 Then Exit Do
    Loop
    If n <= 6 Then MsgBox "Danh ba chua co du lieu.", vbInformation: Exit Sub
    Application.EnableEvents = False
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("A5:A" & n - 1), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("B5:B" & n - 1), Order:=xlAscending
        .SetRange ws.Range("A5:D" & n - 1)
        .Header = xlNo
        .Apply
    End With
    Application.EnableEvents = True
    Application.Calculate
    MsgBox "Da gom cac tai khoan cung mot ben thu huong lai canh nhau." & vbCrLf & _
           "Kiem tra cot E sheet danh ba, khong con dong bao do la duoc.", vbInformation
End Sub

Public Sub MoThuMucOutput()
    Dim p As String
    p = ThisWorkbook.Path & Application.PathSeparator & "Output"
    TaoThuMuc p
    MoThuMuc p
End Sub

Public Sub XoaDuLieuDotGiaiNgan()
    ' Xoa bang ke, ben thu huong va cac o nhap rieng cua dot giai ngan truoc
    Dim a As VbMsgBoxResult
    a = MsgBox("Xoa du lieu cua dot giai ngan hien tai?" & vbCrLf & vbCrLf & _
               "Se xoa: bang ke chung tu (HOA_DON) va ben thu huong (THU_HUONG)." & vbCrLf & _
               "KHONG xoa: so KHE_UOC, DANH_MUC, TSBD, DIEU_KIEN.", _
               vbQuestion + vbYesNo, "Bat dau dot giai ngan moi") 
    If a = vbNo Then Exit Sub
    Application.EnableEvents = False
    ThisWorkbook.Sheets(S_HD).Range("B" & HD_R1 & ":I" & HD_R2).ClearContents
    ThisWorkbook.Sheets(S_TH).Range("B" & TH_R1 & ":B" & TH_R2).ClearContents
    ThisWorkbook.Sheets(S_TH).Range("F" & TH_R1 & ":G" & TH_R2).ClearContents
    ThisWorkbook.Sheets(S_GN).Range("C33").ClearContents   ' mo khoa so KUNN
    Call TraLaiCongThucTheoGoi
    ThisWorkbook.Sheets(S_GN).Range("C16").ClearContents   ' xoa goi -> dot sau phai chon lai
    Application.EnableEvents = True
    Application.Calculate
    MsgBox "Da xoa. Buoc 1: chon GOI / UBG o o C16 sheet GIAI_NGAN." & vbCrLf & _
           "Buoc 2: nhap bang ke (HOA_DON) va ben thu huong (THU_HUONG).", vbInformation
End Sub

' Tra lai cong thuc "theo goi" cho cac o cho phep go de (C8 so ngay vay, C9 ngay dao han, C10 lai suat, C35 ma lai suat)
Public Sub TraLaiCongThucTheoGoi()
    Dim wsG As Worksheet
    Set wsG = ThisWorkbook.Sheets(S_GN)
    Application.EnableEvents = False
    wsG.Range("C8").Formula = "=IF(UBG!$J$2=0,DANH_MUC!$C$26,IF(INDEX(UBG!$H$5:$H$24,UBG!$J$2)="""",DANH_MUC!$C$26,INDEX(UBG!$H$5:$H$24,UBG!$J$2)))"
    wsG.Range("C9").Formula = "=IF(OR($C$6="""",$C$8=""""),"""",$C$6+$C$8)"
    wsG.Range("C10").Formula = "=IF(UBG!$J$2=0,"""",IF(INDEX(UBG!$G$5:$G$24,UBG!$J$2)="""","""",INDEX(UBG!$G$5:$G$24,UBG!$J$2)))"
    wsG.Range("C35").Formula = "=IF(UBG!$J$2=0,"""",IF(INDEX(UBG!$I$5:$I$24,UBG!$J$2)="""","""",INDEX(UBG!$I$5:$I$24,UBG!$J$2)))"
    Application.EnableEvents = True
    Application.Calculate
End Sub

' Chuyen tieng Viet co dau -> khong dau.
' Hop thoai MsgBox cua VBA hien theo bang ma ANSI nen chu co dau bi loi,
' vi vay moi doan chu lay tu sheet / ten file deu phai di qua ham nay.

'==========================================================================
' NUT BAM - chay 1 lan sau khi import module: tao cac nut tren GIAI_NGAN va BAT_DAU
'==========================================================================
Public Sub TaoNutBam()
    Dim ws As Worksheet, i As Long, ten As Variant, macro As Variant, y As Single
    ten = Array("XUAT DU BO HO SO (KUNN + To trinh + Bang ke)", "Chi xuat lai KUNN", "Chi xuat lai To trinh", _
                "Chi xuat lai Bang ke", "DOT MOI - xoa bang ke, mo khoa so", "Mo khoa so KUNN", "Mo thu muc Output")
    macro = Array("XuatHoSoGiaiNgan", "Xuat_KUNN", "Xuat_ToTrinh", "Xuat_BangKe", "XoaDuLieuDotGiaiNgan", "MoKhoaSoKUNN", "MoThuMucOutput")

    Set ws = ThisWorkbook.Sheets("GIAI_NGAN")
    Call XoaNut(ws)
    y = ws.Range("F6").Top
    For i = 0 To UBound(ten)
        Call ThemNut(ws, "btn_gn_" & i, CStr(ten(i)), CStr(macro(i)), ws.Range("F6").Left, y, 230, IIf(i = 0, 34, 24), _
                     IIf(i = 0, RGB(46, 95, 163), IIf(i = 4, RGB(197, 90, 17), RGB(221, 235, 247))), (i = 0 Or i = 4))
        y = y + IIf(i = 0, 40, 30)
    Next i

    On Error Resume Next
    Set ws = ThisWorkbook.Sheets("BAT_DAU")
    On Error GoTo 0
    If Not ws Is Nothing Then
        Call XoaNut(ws)
        Call ThemNut(ws, "btn_bd_0", "DOT MOI (buoc 1)", "XoaDuLieuDotGiaiNgan", ws.Range("F6").Left + 290, ws.Range("F3").Top, 150, 24, RGB(197, 90, 17), True)
        Call ThemNut(ws, "btn_bd_1", "XUAT DU BO HO SO (buoc 7)", "XuatHoSoGiaiNgan", ws.Range("F6").Left + 290, ws.Range("F3").Top + 30, 150, 24, RGB(46, 95, 163), True)
        Call ThemNut(ws, "btn_bd_2", "Tao lai nut bam", "TaoNutBam", ws.Range("F6").Left + 290, ws.Range("F3").Top + 60, 150, 20, RGB(221, 235, 247), False)
    End If
    MsgBox "Da tao nut bam tren sheet GIAI_NGAN (cot F) va BAT_DAU." & vbCrLf & _
           "Nut nao mo thi bam vao la chay macro tuong ung.", vbInformation, "Tao nut bam"
End Sub

Private Sub XoaNut(ws As Worksheet)
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        If Left$(ws.Shapes(i).Name, 4) = "btn_" Then ws.Shapes(i).Delete
    Next i
End Sub

Private Sub ThemNut(ws As Worksheet, ten As String, chu As String, macro As String, _
                    l As Single, t As Single, w As Single, h As Single, mau As Long, chuTrang As Boolean)
    Dim sh As Object
    Set sh = ws.Shapes.AddShape(5, l, t, w, h)          ' 5 = msoShapeRoundedRectangle
    sh.Name = ten
    sh.OnAction = macro
    sh.Fill.ForeColor.RGB = mau
    sh.Line.Visible = 0
    sh.Shadow.Visible = 0
    With sh.TextFrame
        .Characters.Text = chu
        .Characters.Font.Name = "Arial"
        .Characters.Font.Size = IIf(h >= 30, 10, 9)
        .Characters.Font.Bold = True
        .Characters.Font.Color = IIf(chuTrang, RGB(255, 255, 255), RGB(31, 56, 100))
        .HorizontalAlignment = -4108
        .VerticalAlignment = -4108
        .MarginLeft = 4: .MarginRight = 4
    End With
End Sub

Private Function BoDau(ByVal s As String) As String
    Static bangDau As String, bangThuong As String
    Dim i As Long, p As Long, ch As String, kq As String

    If Len(bangDau) = 0 Then
        bangDau = bangDau & ChrW(&H00C0) & ChrW(&H00C1) & ChrW(&H00C2) & ChrW(&H00C3) & ChrW(&H00C4) & ChrW(&H00C5) & ChrW(&H00C8) & ChrW(&H00C9) & ChrW(&H00CA) & ChrW(&H00CB) & ChrW(&H00CC) & ChrW(&H00CD)
        bangDau = bangDau & ChrW(&H00CE) & ChrW(&H00CF) & ChrW(&H00D2) & ChrW(&H00D3) & ChrW(&H00D4) & ChrW(&H00D5) & ChrW(&H00D6) & ChrW(&H00D9) & ChrW(&H00DA) & ChrW(&H00DB) & ChrW(&H00DC) & ChrW(&H00DD)
        bangDau = bangDau & ChrW(&H00E0) & ChrW(&H00E1) & ChrW(&H00E2) & ChrW(&H00E3) & ChrW(&H00E4) & ChrW(&H00E5) & ChrW(&H00E8) & ChrW(&H00E9) & ChrW(&H00EA) & ChrW(&H00EB) & ChrW(&H00EC) & ChrW(&H00ED)
        bangDau = bangDau & ChrW(&H00EE) & ChrW(&H00EF) & ChrW(&H00F2) & ChrW(&H00F3) & ChrW(&H00F4) & ChrW(&H00F5) & ChrW(&H00F6) & ChrW(&H00F9) & ChrW(&H00FA) & ChrW(&H00FB) & ChrW(&H00FC) & ChrW(&H00FD)
        bangDau = bangDau & ChrW(&H00FF) & ChrW(&H0100) & ChrW(&H0101) & ChrW(&H0102) & ChrW(&H0103) & ChrW(&H0104) & ChrW(&H0105) & ChrW(&H0112) & ChrW(&H0113) & ChrW(&H0114) & ChrW(&H0115) & ChrW(&H0116)
        bangDau = bangDau & ChrW(&H0117) & ChrW(&H0118) & ChrW(&H0119) & ChrW(&H011A) & ChrW(&H011B) & ChrW(&H0128) & ChrW(&H0129) & ChrW(&H012A) & ChrW(&H012B) & ChrW(&H012C) & ChrW(&H012D) & ChrW(&H012E)
        bangDau = bangDau & ChrW(&H012F) & ChrW(&H0130) & ChrW(&H014C) & ChrW(&H014D) & ChrW(&H014E) & ChrW(&H014F) & ChrW(&H0150) & ChrW(&H0151) & ChrW(&H0168) & ChrW(&H0169) & ChrW(&H016A) & ChrW(&H016B)
        bangDau = bangDau & ChrW(&H016C) & ChrW(&H016D) & ChrW(&H016E) & ChrW(&H016F) & ChrW(&H0170) & ChrW(&H0171) & ChrW(&H0172) & ChrW(&H0173) & ChrW(&H0176) & ChrW(&H0177) & ChrW(&H0178) & ChrW(&H01A0)
        bangDau = bangDau & ChrW(&H01A1) & ChrW(&H01AF) & ChrW(&H01B0) & ChrW(&H01CD) & ChrW(&H01CE) & ChrW(&H01CF) & ChrW(&H01D0) & ChrW(&H01D1) & ChrW(&H01D2) & ChrW(&H01D3) & ChrW(&H01D4) & ChrW(&H01D5)
        bangDau = bangDau & ChrW(&H01D6) & ChrW(&H01D7) & ChrW(&H01D8) & ChrW(&H01D9) & ChrW(&H01DA) & ChrW(&H01DB) & ChrW(&H01DC) & ChrW(&H01DE) & ChrW(&H01DF) & ChrW(&H01E0) & ChrW(&H01E1) & ChrW(&H01EA)
        bangDau = bangDau & ChrW(&H01EB) & ChrW(&H01EC) & ChrW(&H01ED) & ChrW(&H01FA) & ChrW(&H01FB) & ChrW(&H0200) & ChrW(&H0201) & ChrW(&H0202) & ChrW(&H0203) & ChrW(&H0204) & ChrW(&H0205) & ChrW(&H0206)
        bangDau = bangDau & ChrW(&H0207) & ChrW(&H0208) & ChrW(&H0209) & ChrW(&H020A) & ChrW(&H020B) & ChrW(&H020C) & ChrW(&H020D) & ChrW(&H020E) & ChrW(&H020F) & ChrW(&H0214) & ChrW(&H0215) & ChrW(&H0216)
        bangDau = bangDau & ChrW(&H0217) & ChrW(&H0226) & ChrW(&H0227) & ChrW(&H0228) & ChrW(&H0229) & ChrW(&H022A) & ChrW(&H022B) & ChrW(&H022C) & ChrW(&H022D) & ChrW(&H022E) & ChrW(&H022F) & ChrW(&H0230)
        bangDau = bangDau & ChrW(&H0231) & ChrW(&H0232) & ChrW(&H0233) & ChrW(&H1E00) & ChrW(&H1E01) & ChrW(&H1E14) & ChrW(&H1E15) & ChrW(&H1E16) & ChrW(&H1E17) & ChrW(&H1E18) & ChrW(&H1E19) & ChrW(&H1E1A)
        bangDau = bangDau & ChrW(&H1E1B) & ChrW(&H1E1C) & ChrW(&H1E1D) & ChrW(&H1E2C) & ChrW(&H1E2D) & ChrW(&H1E2E) & ChrW(&H1E2F) & ChrW(&H1E4C) & ChrW(&H1E4D) & ChrW(&H1E4E) & ChrW(&H1E4F) & ChrW(&H1E50)
        bangDau = bangDau & ChrW(&H1E51) & ChrW(&H1E52) & ChrW(&H1E53) & ChrW(&H1E72) & ChrW(&H1E73) & ChrW(&H1E74) & ChrW(&H1E75) & ChrW(&H1E76) & ChrW(&H1E77) & ChrW(&H1E78) & ChrW(&H1E79) & ChrW(&H1E7A)
        bangDau = bangDau & ChrW(&H1E7B) & ChrW(&H1E8E) & ChrW(&H1E8F) & ChrW(&H1E99) & ChrW(&H1EA0) & ChrW(&H1EA1) & ChrW(&H1EA2) & ChrW(&H1EA3) & ChrW(&H1EA4) & ChrW(&H1EA5) & ChrW(&H1EA6) & ChrW(&H1EA7)
        bangDau = bangDau & ChrW(&H1EA8) & ChrW(&H1EA9) & ChrW(&H1EAA) & ChrW(&H1EAB) & ChrW(&H1EAC) & ChrW(&H1EAD) & ChrW(&H1EAE) & ChrW(&H1EAF) & ChrW(&H1EB0) & ChrW(&H1EB1) & ChrW(&H1EB2) & ChrW(&H1EB3)
        bangDau = bangDau & ChrW(&H1EB4) & ChrW(&H1EB5) & ChrW(&H1EB6) & ChrW(&H1EB7) & ChrW(&H1EB8) & ChrW(&H1EB9) & ChrW(&H1EBA) & ChrW(&H1EBB) & ChrW(&H1EBC) & ChrW(&H1EBD) & ChrW(&H1EBE) & ChrW(&H1EBF)
        bangDau = bangDau & ChrW(&H1EC0) & ChrW(&H1EC1) & ChrW(&H1EC2) & ChrW(&H1EC3) & ChrW(&H1EC4) & ChrW(&H1EC5) & ChrW(&H1EC6) & ChrW(&H1EC7) & ChrW(&H1EC8) & ChrW(&H1EC9) & ChrW(&H1ECA) & ChrW(&H1ECB)
        bangDau = bangDau & ChrW(&H1ECC) & ChrW(&H1ECD) & ChrW(&H1ECE) & ChrW(&H1ECF) & ChrW(&H1ED0) & ChrW(&H1ED1) & ChrW(&H1ED2) & ChrW(&H1ED3) & ChrW(&H1ED4) & ChrW(&H1ED5) & ChrW(&H1ED6) & ChrW(&H1ED7)
        bangDau = bangDau & ChrW(&H1ED8) & ChrW(&H1ED9) & ChrW(&H1EDA) & ChrW(&H1EDB) & ChrW(&H1EDC) & ChrW(&H1EDD) & ChrW(&H1EDE) & ChrW(&H1EDF) & ChrW(&H1EE0) & ChrW(&H1EE1) & ChrW(&H1EE2) & ChrW(&H1EE3)
        bangDau = bangDau & ChrW(&H1EE4) & ChrW(&H1EE5) & ChrW(&H1EE6) & ChrW(&H1EE7) & ChrW(&H1EE8) & ChrW(&H1EE9) & ChrW(&H1EEA) & ChrW(&H1EEB) & ChrW(&H1EEC) & ChrW(&H1EED) & ChrW(&H1EEE) & ChrW(&H1EEF)
        bangDau = bangDau & ChrW(&H1EF0) & ChrW(&H1EF1) & ChrW(&H1EF2) & ChrW(&H1EF3) & ChrW(&H1EF4) & ChrW(&H1EF5) & ChrW(&H1EF6) & ChrW(&H1EF7) & ChrW(&H1EF8) & ChrW(&H1EF9) & ChrW(&H0111) & ChrW(&H0110)
        bangThuong = bangThuong & "AAAAAAEEEEIIIIOOOOOUUUUYaaaaaaeeeeiiiiooooouuuuyyAaAaAaEeEeE"
        bangThuong = bangThuong & "eEeEeIiIiIiIiIOoOoOoUuUuUuUuUuUuYyYOoUuAaIiOoUuUuUuUuUuAaAaO"
        bangThuong = bangThuong & "oOoAaAaAaEeEeIiIiOoOoUuUuAaEeOoOoOoOoYyAaEeEeEeEeEeIiIiOoOoO"
        bangThuong = bangThuong & "oOoUuUuUuUuUuYyyAaAaAaAaAaAaAaAaAaAaAaAaEeEeEeEeEeEeEeEeIiIi"
        bangThuong = bangThuong & "OoOoOoOoOoOoOoOoOoOoOoOoUuUuUuUuUuUuUuYyYyYyYydD"
    End If

    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If AscW(ch) > 127 Then
            p = InStr(bangDau, ch)
            If p > 0 Then
                kq = kq & Mid$(bangThuong, p, 1)
            ElseIf AscW(ch) = &H2714 Or AscW(ch) = &H221A Then
                kq = kq & "[OK]"
            ElseIf AscW(ch) = &H2718 Or AscW(ch) = &H2717 Then
                kq = kq & "[X]"
            ElseIf AscW(ch) = &H2705 Then
                kq = kq & "[OK]"
            ElseIf AscW(ch) = &H26D4 Then
                kq = kq & "[!]"
            ElseIf AscW(ch) = &H1F514 Or AscW(ch) = &HD83D Or AscW(ch) = &HDD14 Then
                kq = kq
            ElseIf AscW(ch) = &H2192 Then
                kq = kq & "->"
            ElseIf AscW(ch) = &H2264 Then
                kq = kq & "<="
            ElseIf AscW(ch) = &H2265 Then
                kq = kq & ">="
            ElseIf AscW(ch) = &H00B7 Or AscW(ch) = &H2022 Then
                kq = kq & "-"
            ElseIf AscW(ch) = &H2013 Or AscW(ch) = &H2014 Then
                kq = kq & "-"
            ElseIf AscW(ch) = &H201C Or AscW(ch) = &H201D Then
                kq = kq & Chr(34)
            ElseIf AscW(ch) = &H2018 Or AscW(ch) = &H2019 Then
                kq = kq & "'"
            ElseIf AscW(ch) = &H2026 Then
                kq = kq & "..."
            End If
        Else
            kq = kq & ch
        End If
    Next i
    BoDau = kq
End Function


'==========================================================================
' TIEN ICH HE THONG FILE - CHAY DUOC TREN O MANG VA DUONG DAN CO DAU
'==========================================================================
' Cac ham Dir / MkDir / Open / Shell san co cua VBA doc duong dan theo bang ma
' ANSI. Neu duong dan co chu tieng Viet co dau (vi du "...\Ho so giai ngan\")
' hoac nam tren o mang \\may-chu\..., chung se bao "Path/File access error".
' Vi vay moi thao tac file trong module deu di qua Scripting.FileSystemObject.
Private Function FSO() As Object
    Static o As Object
    If o Is Nothing Then Set o = CreateObject("Scripting.FileSystemObject")
    Set FSO = o
End Function

Private Function CoFile(ByVal p As String) As Boolean
    If Len(p) = 0 Then Exit Function
    On Error Resume Next
    CoFile = FSO.FileExists(p)
    On Error GoTo 0
End Function

Private Function CoThuMuc(ByVal p As String) As Boolean
    If Len(p) = 0 Then Exit Function
    On Error Resume Next
    CoThuMuc = FSO.FolderExists(p)
    On Error GoTo 0
End Function

Private Sub TaoThuMuc(ByVal p As String)
    Dim s As String
    s = p
    If Right$(s, 1) = "\" Then s = Left$(s, Len(s) - 1)
    If Len(s) = 0 Then Exit Sub
    If CoThuMuc(s) Then Exit Sub
    FSO.CreateFolder s
End Sub

' Lay rieng ten file tu duong dan day du
Private Function TenFile(ByVal p As String) As String
    On Error Resume Next
    TenFile = FSO.GetFileName(p)
    On Error GoTo 0
    If Len(TenFile) = 0 Then TenFile = p
End Function

' Mo thu muc bang Explorer (Shell san co cua VBA cung la ANSI)
Private Sub MoThuMuc(ByVal p As String)
    On Error Resume Next
    CreateObject("WScript.Shell").Run """" & p & """", 1, False
    On Error GoTo 0
End Sub

' Chay macro nay khi tool khong xuat duoc file - no bao ro dang vuong o dau.
Public Sub KiemTraMoiTruong()
    Dim tpl As String, outDir As String, s As String, i As Long
    Dim coDau As String, ch As String, wdTest As Object

    tpl = ThisWorkbook.Path & Application.PathSeparator & "Template" & Application.PathSeparator
    outDir = ThisWorkbook.Path & Application.PathSeparator & "Output" & Application.PathSeparator

    s = "KIEM TRA MOI TRUONG CHAY TOOL" & vbCrLf & String(54, "-") & vbCrLf
    s = s & "Ban module      : " & PHIEN_BAN & vbCrLf & vbCrLf
    s = s & "Thu muc file    : " & BoDau(ThisWorkbook.Path) & vbCrLf

    For i = 1 To Len(ThisWorkbook.Path)
        ch = Mid$(ThisWorkbook.Path, i, 1)
        If AscW(ch) > 127 Then coDau = coDau & ch
    Next i
    If Len(coDau) > 0 Then
        s = s & "  [!] Duong dan CO CHU TIENG VIET CO DAU: " & BoDau(coDau) & vbCrLf
        s = s & "      Tool van chay duoc, nhung KHONG import duoc file .bas tu" & vbCrLf
        s = s & "      duong dan nay. Chep ModGiaiNgan.bas ra C:\Temp roi import." & vbCrLf
    Else
        s = s & "  [OK] Duong dan khong co chu co dau" & vbCrLf
    End If

    If Left$(ThisWorkbook.Path, 2) = "\\" Then
        s = s & "  [!] Dang chay tren o mang (UNC). Can dat Trusted Location," & vbCrLf
        s = s & "      xem muc L trong sheet HUONG_DAN." & vbCrLf
    End If

    s = s & vbCrLf & "Quyen ghi file  : " & IIf(ThisWorkbook.ReadOnly, _
            "[X] CHI DOC - nguoi khac dang mo file nay", "[OK] ghi duoc") & vbCrLf
    s = s & "Thu muc Template: " & IIf(CoThuMuc(tpl), "[OK] co", "[X] KHONG THAY") & vbCrLf
    s = s & "Thu muc Output  : " & IIf(CoThuMuc(outDir), "[OK] co", "[X] KHONG THAY - se tu tao") & vbCrLf

    s = s & vbCrLf & "Bieu mau Word:" & vbCrLf
    s = s & "  KUNN      : " & IIf(CoFile(tpl & DM(ThisWorkbook.Sheets(S_DM), "FILE_KUNN")), "[OK]", "[X] thieu") & vbCrLf
    s = s & "  To trinh  : " & IIf(CoFile(tpl & DM(ThisWorkbook.Sheets(S_DM), "FILE_PDGN")), "[OK]", "[X] thieu") & vbCrLf
    s = s & "  Bang ke   : " & IIf(CoFile(tpl & DM(ThisWorkbook.Sheets(S_DM), "FILE_BANGKE")), "[OK]", "[X] thieu") & vbCrLf

    On Error Resume Next
    Err.Clear
    Set wdTest = CreateObject("Word.Application")
    If Err.Number <> 0 Then
        s = s & vbCrLf & "Microsoft Word  : [X] khong khoi dong duoc (ma " & Err.Number & ")"
    Else
        s = s & vbCrLf & "Microsoft Word  : [OK] khoi dong duoc"
        wdTest.Quit 0
    End If
    Set wdTest = Nothing
    Err.Clear
    On Error GoTo 0

    MsgBox s, vbInformation, "Kiem tra moi truong"
End Sub


' O C34 sheet GIAI_NGAN: "Khong gop" hay "Gop theo nha cung cap".
' Tra ve cot nguon dung de gom nhom tren sheet HOA_DON (2 = Ten NCC), 0 = khong gop.
Private Function GopBangKe() As Long
    Dim v As String
    On Error Resume Next
    v = Trim(CStr(ThisWorkbook.Sheets(S_GN).Range("C34").Value))
    On Error GoTo 0
    If UCase(Left$(v, 1)) = "G" Then GopBangKe = 2
End Function

Private Function NhanTongNhom() As String
    NhanTongNhom = "T" & ChrW(&H1ED5) & "ng s" & ChrW(&H1ED1) & " ti" & ChrW(&H1EC1) & "n gi" & ChrW(&H1EA3) & "i ng" & ChrW(&H00E2) & "n "
End Function

Private Function DM(ws As Worksheet, key As String) As Variant
    Dim i As Long
    For i = 4 To 200
        If CStr(ws.Cells(i, 4).Value) = key Then DM = ws.Cells(i, 3).Value: Exit Function
    Next i
    DM = ""
End Function

Private Function FDate(v As Variant) As String
    If IsDate(v) Then FDate = Format(v, "dd/mm/yyyy") Else FDate = CStr(v)
End Function

Private Function Nz(v As Variant) As Double
    If IsNumeric(v) Then Nz = CDbl(v) Else Nz = 0
End Function
