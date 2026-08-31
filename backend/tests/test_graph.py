import asyncio,json
from pathlib import Path
from app.core.config import Settings
from app.services import graph

class Response:
    status_code=200;headers={}
    def __init__(self,url):self.url=url
    def raise_for_status(self):pass
    def json(self):
        folder=next(x for x in graph.FOLDERS if f"/{x}/" in self.url)
        return {"value":[{"id":folder}],"@odata.deltaLink":f"https://graph.microsoft.com/delta/{folder}"}
class Client:
    async def __aenter__(self):return self
    async def __aexit__(self,*_):pass
    async def get(self,url,headers):return Response(url)
class TokenApp:
    def acquire_token_silent(self,*_,**__):return {"access_token":"token"}

def test_graph_sync_reads_every_required_folder(monkeypatch):
    adapter=graph.GraphDeltaSync.__new__(graph.GraphDeltaSync);adapter.settings=Settings();adapter.app=TokenApp();monkeypatch.setattr(graph.httpx,"AsyncClient",lambda **_:Client())
    items,state=asyncio.run(adapter.sync_mailbox("support@example.com"));parsed=json.loads(state)
    assert {x["_folder"] for x in items}==set(graph.FOLDERS)
    assert set(parsed)==set(graph.FOLDERS)
def test_graph_certificate_credential():
    key=Path(__file__).parents[2]/"README.md"
    settings=Settings(azure_client_secret="",azure_client_certificate_path=str(key),azure_client_certificate_thumbprint="ABC123")
    credential=graph.GraphDeltaSync._credential(settings)
    assert credential["private_key"].startswith("# OEIS") and credential["thumbprint"]=="ABC123"

def test_graph_reacquires_once_on_401_and_honors_retry_after_on_429():
    class ScriptedResponse:
        def __init__(self,status,body=None,headers=None):self.status_code=status;self._body=body or {};self.headers=headers or {}
        def raise_for_status(self):
            if self.status_code>=400:raise RuntimeError(f"HTTP {self.status_code}")
        def json(self):return self._body
    class ScriptedClient:
        def __init__(self):self.responses=[ScriptedResponse(401),ScriptedResponse(429,headers={"Retry-After":"0"}),ScriptedResponse(200,{"value":[],"@odata.deltaLink":"https://graph.microsoft.com/delta/inbox"})];self.tokens=[]
        async def get(self,url,headers):self.tokens.append(headers["Authorization"]);return self.responses.pop(0)
    adapter=graph.GraphDeltaSync.__new__(graph.GraphDeltaSync);calls=[]
    async def token(force=False):calls.append(force);return "fresh-token"
    adapter._token=token;adapter.settings=Settings();client=ScriptedClient()
    items,delta=asyncio.run(adapter._folder(client,"support@example.com","inbox","https://graph.microsoft.com/start","expired-token"))
    assert items==[] and delta=="https://graph.microsoft.com/delta/inbox"
    assert calls==[True]
    assert client.tokens==["Bearer expired-token","Bearer fresh-token","Bearer fresh-token"]

def test_graph_message_content_requests_plain_text_and_encodes_message_id(monkeypatch):
    class ContentResponse:
        status_code=200;headers={}
        def json(self):return {"body":{"content":"Full customer request"}}
    class ContentClient:
        async def __aenter__(self):return self
        async def __aexit__(self,*_):pass
        async def get(self,url,headers):self.url=url;self.headers=headers;return ContentResponse()
    client=ContentClient();adapter=graph.GraphDeltaSync.__new__(graph.GraphDeltaSync);adapter.settings=Settings()
    async def token(force=False):return "token"
    adapter._token=token;monkeypatch.setattr(graph.httpx,"AsyncClient",lambda **_:client)
    content=asyncio.run(adapter.message_content("support@example.com","opaque/id+value="))
    assert content=="Full customer request"
    assert "/users/support@example.com/messages/opaque%2Fid%2Bvalue%3D" in client.url
    assert client.headers["Prefer"]=='outlook.body-content-type="text"'
