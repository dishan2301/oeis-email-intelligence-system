import smtplib
import ssl
from email.message import EmailMessage
from app.core.config import get_settings

def send_html(to:str,subject:str,html:str)->bool:
    s=get_settings()
    if not s.smtp_host or not to:return False
    message=EmailMessage();message["From"]=s.smtp_from or s.smtp_username;message["To"]=to;message["Subject"]=subject;message.set_content("This notification requires an HTML-capable email client.");message.add_alternative(html,subtype="html")
    with smtplib.SMTP(s.smtp_host,s.smtp_port,timeout=30) as client:
        client.starttls(context=ssl.create_default_context());client.login(s.smtp_username,s.smtp_password);client.send_message(message)
    return True
