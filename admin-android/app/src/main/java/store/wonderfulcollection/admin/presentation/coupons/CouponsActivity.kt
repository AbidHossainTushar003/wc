package store.wonderfulcollection.admin.presentation.coupons

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator

class CouponsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "🏷️ Promo Coupons"
            textSize = 24f
            setTextColor(0xFF0891B2.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(list)
        setContentView(scroll)

        lifecycleScope.launch {
            ServiceLocator.couponRepository.getCoupons().onSuccess { coupons ->
                coupons.forEach { cp ->
                    val card = LinearLayout(this@CouponsActivity).apply {
                        orientation = LinearLayout.VERTICAL
                        setBackgroundColor(0xFF1E293B.toInt())
                        setPadding(20, 20, 20, 20)
                        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                        lp.setMargins(0, 0, 0, 16)
                        layoutParams = lp
                    }
                    val codeTv = TextView(this@CouponsActivity).apply {
                        text = cp.code
                        textSize = 17f
                        paint.isFakeBoldText = true
                        setTextColor(0xFF38BDF8.toInt())
                    }
                    val detailTv = TextView(this@CouponsActivity).apply {
                        val discStr = if (cp.type == "percentage") "${cp.value}% OFF" else "৳%,.0f OFF".format(cp.value)
                        text = "Discount: $discStr  |  Min Order: ৳%,.0f\nExpiry: ${cp.expiryDate}  |  Status: ${if (cp.isActive) "Active" else "Disabled"}".format(cp.minOrder)
                        textSize = 13f
                        setTextColor(0xFFF8FAFC.toInt())
                        setPadding(0, 6, 0, 0)
                    }
                    card.addView(codeTv)
                    card.addView(detailTv)
                    list.addView(card)
                }
            }
        }
    }
}

