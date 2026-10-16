"""Create a self-contained Word guide using standard Office Open XML."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

OUT = Path("documents/Lead_Follow_Up_First_Campaign_Guide.docx")
paragraphs = []

def p(text, style="Normal"):
    paragraphs.append(f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>')

def h(text): p(text, "Heading1")
def sub(text): p(text, "Heading2")
def bullet(text): p("•  " + text, "List")
def step(number, text): p(f"{number}.  {text}", "List")
def note(text): p(text, "Note")
def page(): paragraphs.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

p("LEAD FOLLOW-UP", "Subtitle")
p("Set Up Your First Campaign", "Title")
p("A beginner’s step-by-step guide", "Subtitle")
p("This guide walks you through adding your offer, connecting the form that collects your leads, and checking that your first lead arrives.")
h("What is a campaign?")
p("A campaign is the ad or offer someone responds to—for example, “Back Pain Relief — $49 New Patient Special.”")
p("Setting up the campaign tells Lead Follow-Up which offer the person asked about, so your team sees the correct information in the call script.")
sub("There are two parts to setup")
step(1, "Add the campaign and its offer details.")
step(2, "Connect the form where people enter their information.")
note("Saving a campaign does not automatically connect your ads or lead form.")
h("Before You Start")
p("Have these items ready:")
for text in [
    "The name of the service you are promoting.",
    "A copy of the ad or offer.",
    "What the offer includes and its price.",
    "Access to the form that collects the person’s name and phone number—or help from the person who manages it.",
]: bullet(text)
p("Use your own name and phone number when testing the connection.")

page()
h("Step 1: Open Campaigns")
for n, text in enumerate([
    "Sign in to your account.",
    "Make sure you are in Lead Follow-Up, not Reactivation.",
    "Click the large Campaigns button on the welcome screen. You can also click Campaigns in the top navigation.",
    "Click New Campaign.",
], 1): step(n, text)
h("Step 2: Enter Your Offer")
p("Complete the fields on the new campaign screen.")
sub("Service type")
p("Select the service being advertised. Choose the service that matches the ad. This helps the system use the appropriate call script.")
sub("Campaign name")
p("Give the campaign a name your team will recognize.")
p("Example: Back Pain Relief — $49 New Patient Special")
sub("What’s included in the offer")
p("Enter each included item on a separate line. Click Add a line if you need more space.")
p("Example:")
for text in ["Consultation with the doctor", "Examination", "Review of findings"]: bullet(text)
p("Only list items that are actually included in your offer.")
sub("Price")
p("Choose how you want the caller to describe the price:")
bullet("“Normally X, now Y” — enter the regular price and offer price.")
bullet("“Just Y” — enter only the offer price.")
bullet("Don’t mention price — leave pricing out of the spoken script.")
p("Review the On the call: preview to see how it will sound.")
sub("Offer expiration or limited spots")
p("This field is optional. Complete it only if the offer has a real deadline or limited availability. Example: Offer ends Friday.")
note("Check your details against the original ad, then click Save & Connect Leads.")

page()
h("Step 3: Choose Where Your Leads Come From")
p("On the next screen, look for Finish connecting your lead form.")
p("If the setup instructions are closed, click Continue setup.")
p("Choose where people actually enter their name and phone number:")
bullet("Facebook / Instagram — they fill out a form inside the ad.")
bullet("GoHighLevel — they fill out a GoHighLevel form, or their information already goes into GoHighLevel.")
bullet("Our website — they fill out a form on your website.")
bullet("I’m not sure — choose this if you need help identifying the form.")
note("Choose where the form is—not simply where the ad appears. For example, a Facebook ad that sends people to your website may use Our website.")
h("Step 4: Connect Your Form")
p("The setup screen gives your campaign a private connection address. This tells your form where to send new leads.")
for n, text in enumerate([
    "Click Copy address.",
    "Follow the instructions displayed for the source you selected.",
    "Make sure the connection sends at least the person’s first name and phone number.",
    "Save and turn on or publish the connection in your form system.",
], 1): step(n, text)
p("The process depends on your form:")
bullet("GoHighLevel: Follow the on-screen workflow instructions.")
bullet("Facebook / Instagram: Follow the instructions for connecting through GoHighLevel, Zapier, or Make. Facebook does not connect simply by pasting in the address.")
bullet("Our website: Follow the instructions for your website’s form tool. Some forms connect directly; others need Zapier or Make.")
note("Keep the connection address private. Do not display it in your ad or on a public webpage.")
sub("If someone else manages your forms")
p("You can send them this message:")
p("I’ve created our campaign in Lead Follow-Up. Please connect the form for this offer to the campaign’s private connection address using the setup instructions in our account. Make sure first name and phone number are sent. After connecting it, please submit a test through the actual form so we can confirm it arrives.", "Quote")

page()
h("Step 5: Test Your Actual Form")
note("Do not skip this step.")
for n, text in enumerate([
    "Open the same form a prospective patient would use.",
    "Submit it using your own name and phone number.",
    "Return to the campaign’s connection screen.",
    "Look for Form submission received and Your lead form is connected.",
    "Open the campaign’s Leads tab and confirm your test entry appears.",
], 1): step(n, text)
note("Important: The Send internal test button checks part of the software, but it does not prove your real ad or website form is connected. Test through the actual form.")
p("If your test does not arrive, return to the connection instructions and check that the connection is turned on and includes first name and phone number.")
h("Step 6: Preview the Call Script")
p("On the campaign screen, click Practice script.")
p("Read through the script and try the response buttons. Check that the service, offer details, and pricing match your ad.")
p("This lets your team practice before speaking with a real lead.")
h("Step 7: Find Your New Leads")
p("When you are ready to work:")
step(1, "Click Calls Due Now in the top navigation.")
step(2, "Look under Ready to call.")
step(3, "Click Call Now beside a lead to open that person’s call script.")
note("Call Now opens the call screen; it does not automatically dial the phone.")
p("To browse everyone—not just leads currently due for a call—click All Leads on the queue screen or Leads in the top navigation.")

page()
h("First-Campaign Checklist")
p("Use this checklist to confirm you have completed setup.")
for text in [
    "I created the campaign.",
    "The service, offer details, and price match our ad.",
    "I connected the actual lead form.",
    "I submitted a test through that form.",
    "The test appeared in the campaign’s lead list.",
    "I reviewed the practice script.",
    "I know where to find Calls Due Now and All Leads.",
]: p("☐  " + text, "Checklist")
note("Your first campaign is ready when a submission from your actual form successfully appears in Lead Follow-Up.")

ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{''.join(paragraphs)}
<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="1000" w:bottom="900" w:left="1000" w:header="400" w:footer="400"/></w:sectPr>
</w:body></w:document>'''
styles = f'''<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="{ns}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="263A4C"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="260" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="150" w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:color w:val="528CA4"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:spacing w:before="230" w:after="140"/></w:pPr><w:rPr><w:b/><w:color w:val="365F75"/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/><w:spacing w:before="140" w:after="65"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="List"><w:name w:val="List"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="230" w:hanging="230"/><w:spacing w:after="85"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:fill="EDF5F7"/><w:spacing w:before="100" w:after="150"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="250" w:right="250"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Checklist"><w:name w:val="Checklist"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr></w:style>
</w:styles>'''
footer = f'''<w:ftr xmlns:w="{ns}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="697A88"/></w:rPr><w:t>Lead Follow-Up • First Campaign Guide  |  </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>'''
files = {
    "[Content_Types].xml": '''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>''',
    "_rels/.rels": '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>''',
    "word/_rels/document.xml.rels": '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>''',
    "word/document.xml": document,
    "word/styles.xml": styles,
    "word/footer1.xml": footer,
}
with ZipFile(OUT, "w", ZIP_DEFLATED) as archive:
    for name, content in files.items():
        ET.fromstring(content)
        archive.writestr(name, content.encode("utf-8"))
with ZipFile(OUT) as archive:
    assert archive.testzip() is None
    root = ET.fromstring(archive.read("word/document.xml"))
    text = "".join(root.itertext())
    for i in range(1, 8):
        assert f"Step {i}:" in text
    assert "First-Campaign Checklist" in text
print(f"Created and validated {OUT} ({OUT.stat().st_size:,} bytes)")