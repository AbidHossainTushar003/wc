package store.wonderfulcollection.admin.presentation.categories

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator

class CategoriesActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "🗂️ Categories"
            textSize = 24f
            setTextColor(0xFF0D9488.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(list)
        setContentView(scroll)

        lifecycleScope.launch {
            ServiceLocator.getCategoriesUseCase().onSuccess { cats ->
                cats.forEach { c ->
                    val tv = TextView(this@CategoriesActivity).apply {
                        text = "• ${c.name} (${c.productCount} items)\nSlug: ${c.slug}\n"
                        setTextColor(0xFFF8FAFC.toInt())
                        textSize = 15f
                        setPadding(0, 8, 0, 8)
                    }
                    list.addView(tv)
                }
            }
        }
    }
}

