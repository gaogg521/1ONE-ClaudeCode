import sys
sys.path.insert(0, r'c:\Users\allenzhao\.openclaw\workspace')
from feishu_tools import read_doc, get_token
print('token:', get_token()[:20])
for url in ['https://huanle.feishu.cn/docx/DvjBdaflVoMDPfx5t6oclRLwnGe', 'https://huanle.feishu.cn/wiki/PTGWwfTcBirjOskdx4EcMHWMnCg']:
    try:
        content = read_doc(url)
        print('url', url, 'len', len(content))
    except Exception as e:
        print('url', url, 'ERROR', e)
