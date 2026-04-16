import extract_text 

pdf_path = "Dsa.pdf"  # Replace with your PDF file path
text = extract_text(pdf_path)  
print(text[:1000])     